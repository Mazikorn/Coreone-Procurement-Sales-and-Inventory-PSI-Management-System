# Plan 5: 后端代码质量 — 详细实施计划

> **优先级**: P1
> **预估工时**: 12h
> **问题来源**: 后端视角审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**后端开发者**，我希望**事务完整、操作者可追溯、索引覆盖常用查询**，以便**数据一致性和查询性能有保障**。

### 数据契约

| 指标 | 目标值 | 当前值 |
|------|--------|--------|
| 缺失事务保护的路由 | 0 | 2 |
| operator 来自 req.body 的路由 | 0 | 2 |
| 缺失的常用索引 | 0 | 15+ |

### 边界契约
- **事务包裹**: 所有多表操作必须在事务内
- **操作者来源**: 统一从 req.user 获取，不信任前端
- **索引添加**: 幂等执行（IF NOT EXISTS）

### 验收标准
- [ ] 所有多表操作有事务保护
- [ ] operator 统一来自 req.user
- [ ] 15+ 个索引已添加

---

## 二、对抗性提示

### 边界 1: 事务内死锁
**风险**: BEGIN IMMEDIATE 在高并发时可能死锁
**测试**: 并发 10 个写操作，验证无死锁超时

### 边界 2: 索引添加导致写入变慢
**风险**: 过多索引影响 INSERT/UPDATE 性能
**测试**: 添加索引后批量插入 1000 条，验证时间 < 2s

### 边界 3: UNIQUE 约束匹配误判
**风险**: `err.message.includes('UNIQUE')` 匹配到物料名称中的 "UNIQUE"
**测试**: 创建名称包含 "UNIQUE" 的物料，验证不误判

---

## 二-B、Red-Green-Refactor 测试要求

### 测试文件

**新增文件**: `后端代码/server/tests/integration/backend-quality.test.ts`

### 测试代码示例

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

describe('后端代码质量', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
  })

  describe('出库 POST 权限检查', () => {
    it('technician 无法创建出库', async () => {
      const res = await request(app).post('/api/v1/outbound').set('Authorization', technicianToken).send({})
      expect(res.status).toBe(403)
    })
  })

  describe('BOM PUT 物料验证', () => {
    it('无效 materialId 返回 404', async () => {
      const res = await request(app).put(`/api/v1/boms/${bomId}`).set('Authorization', adminToken)
        .send({ materials: [{ materialId: 'nonexistent', usage: 1 }] })
      expect(res.status).toBe(404)
    })
  })

  describe('availableStock 扣除 locked_stock', () => {
    it('可用库存 = 库存 - 锁定库存', () => {
      db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?, ?)').run('MAT-001', 100, 30, 'LOC-A01', 1)
      const inv = db.prepare('SELECT stock, locked_stock FROM inventory WHERE material_id = ?').get('MAT-001')
      expect(inv.stock - inv.locked_stock).toBe(70)
    })
  })

  describe('数据库索引', () => {
    it('inbound_records 有 material_id 索引', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='inbound_records'").all()
      expect(indexes.some(i => i.name.includes('material_id'))).toBe(true)
    })
  })
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 写上述测试 | 测试失败 |
| 2 | 运行测试 | 确认失败 |
| 3 | 写最小实现 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |

**禁止**: 跳过 Step 1-2、使用 toBeDefined

---

## 三、任务清单

### 任务 5.1: 添加缺失的事务保护 (2h)

**问题**: reconciliation logs 和 indirect-cost delete 缺少事务

**文件**:
- `reconciliation-v1.1.ts` (POST /logs)
- `indirect-cost-v1.1.ts` (DELETE /:id)

**改动**: 用 `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` 包裹

---

### 任务 5.2: 统一操作者来源 (1h)

**问题**: transfers 和 returns 使用 req.body.operator

**改动**: 统一使用 `(req as any).user?.username || 'system'`

---

### 任务 5.3: 添加缺失的数据库索引 (2h)

**问题**: 15+ 个常用查询缺少索引

**文件**: `DatabaseManager.ts`

**新增索引**:

```sql
CREATE INDEX IF NOT EXISTS idx_inbound_material ON inbound_records(material_id);
CREATE INDEX IF NOT EXISTS idx_inbound_batch ON inbound_records(batch_no);
CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_records(created_at);
CREATE INDEX IF NOT EXISTS idx_outbound_created ON outbound_records(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_logs_created ON stock_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_return_created ON return_records(created_at);
CREATE INDEX IF NOT EXISTS idx_scrap_material ON scrap_records(material_id);
CREATE INDEX IF NOT EXISTS idx_stocktaking_material ON stocktaking_records(material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_lis_project ON lis_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_lis_time ON lis_cases(operate_time);
CREATE INDEX IF NOT EXISTS idx_equipment_usage ON equipment_usage(equipment_id);
CREATE INDEX IF NOT EXISTS idx_batch_tracking_material ON batch_usage_tracking(material_id);
CREATE INDEX IF NOT EXISTS idx_batch_tracking_status ON batch_usage_tracking(status);
```

---

### 任务 5.4: 提取重复的编号生成函数 (2h)

**问题**: 11 个文件有相同的编号生成逻辑

**新增文件**: `后端代码/server/src/utils/generateNo.ts`

```typescript
export function generateNo(prefix: string): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}${date}${time}${random}`
}
```

---

### 任务 5.5: 合并重复的预警检查逻辑 (2h)

**问题**: checkStockAlerts 和 checkOutboundAlerts 逻辑相似

**新增文件**: `后端代码/server/src/utils/alertChecker.ts`

---

### 任务 5.6: 修复 UNIQUE 约束错误匹配 (1h)

**问题**: `err.message.includes('UNIQUE')` 过于宽泛

**改动**: 改为检查 `err.code === 'SQLITE_CONSTRAINT_UNIQUE'`

---

### 任务 5.7: 修复 errorHandler 堆栈泄露 (1h)

**问题**: 开发模式返回 err.stack

**改动**: 堆栈仅写入日志，不在 HTTP 响应中返回

---

### 任务 5.8: 修复出库 POST 创建缺少权限检查

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`

**改动**: POST / 和 POST /bom 添加 requireWriteAccess 中间件

**验收标准**:
- [ ] 非 admin/warehouse_manager 无法创建出库

---

### 任务 5.9: 修复 BOM PUT 不验证物料存在性

**文件**: `后端代码/server/src/routes/bom-v1.1.ts` (PUT /:id)

**改动**: 添加与 POST 相同的物料存在性验证

**验收标准**:
- [ ] 无效 materialId 返回 404

---

### 任务 5.10: 修复 availableStock 忽略 locked_stock

**文件**: `后端代码/server/src/routes/inventory-v1.1.ts`

**改动**: availableStock = stock - locked_stock

**验收标准**:
- [ ] 可用库存正确反映锁定库存

---

### 任务 5.11: 修复 BOM 标准成本更新在事务外

**文件**: `后端代码/server/src/routes/bom-v1.1.ts`

**改动**: 将 updateBomStandardCost 移入事务内

**验收标准**:
- [ ] 标准成本计算失败时整个 BOM 创建回滚

---

## 预估工时

| 任务 | 工时 |
|------|------|
| 5.1 事务保护 | 2h |
| 5.2 操作者来源 | 1h |
| 5.3 数据库索引 | 2h |
| 5.4 编号生成 | 2h |
| 5.5 预警检查 | 2h |
| 5.6 UNIQUE 匹配 | 1h |
| 5.7 errorHandler | 1h |
| **合计** | **11h** |

---

## 四、变更影响面报告

### 改动范围
- 修改文件: ~10 个后端路由/工具文件
- 新增文件: 2 个工具模块 (generateNo.ts, alertChecker.ts)

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| 对账管理 | ✅ | 事务保护验证 |
| 间接成本 | ✅ | 事务保护验证 |
| 调拨管理 | ✅ | operator 来源验证 |
| 退库管理 | ✅ | operator 来源验证 |
| 入库管理 | ✅ | 索引 + 编号生成验证 |
| 出库管理 | ✅ | 索引 + 权限检查验证 |
| 盘点管理 | ✅ | 索引验证 |
| BOM 管理 | ✅ | 物料验证 + 事务验证 |
| 库存管理 | ✅ | 可用库存计算验证 |
| 预警管理 | ✅ | 预警检查逻辑验证 |

### 回滚方案
| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 5.1 事务保护 | 移除 BEGIN IMMEDIATE/COMMIT 包裹 | 恢复数据不一致风险 |
| 5.2 操作者来源 | 恢复 req.body.operator | 恢复操作者可篡改 |
| 5.3 数据库索引 | DROP INDEX IF EXISTS | 恢复查询性能问题 |
| 5.4 编号生成 | 删除 generateNo.ts，恢复内联逻辑 | 恢复重复代码 |
| 5.5 预警检查 | 删除 alertChecker.ts，恢复重复逻辑 | 恢复重复代码 |
| 5.6 UNIQUE 匹配 | 恢复 err.message.includes('UNIQUE') | 恢复误判风险 |
| 5.7 errorHandler | 恢复 err.stack 返回 | 恢复堆栈泄露 |
| 5.8 出库权限 | 移除 requireWriteAccess | 恢复越权操作 |
| 5.9 BOM 验证 | 移除物料存在性检查 | 恢复无效引用 |
| 5.10 可用库存 | 恢复 stock 直接返回 | 恢复忽略锁定库存 |
| 5.11 BOM 事务 | 将 updateBomStandardCost 移出事务 | 恢复部分提交 |

## 五、PM 黑盒验收清单

### 功能正确性
- [ ] 对账日志记录在事务内完成（全部成功或全部回滚）
- [ ] 调拨/退库记录的 operator 是当前登录用户
- [ ] 各模块编号生成格式正确
- [ ] BOM 创建时验证物料存在性
- [ ] 可用库存 = stock - locked_stock

### 数据一致性
- [ ] 并发写操作无数据不一致
- [ ] 入库/出库/盘点列表查询响应正常（索引生效）
- [ ] BOM 标准成本计算失败时整个创建回滚

### 异常处理
- [ ] 堆栈信息不在 HTTP 响应中暴露
- [ ] UNIQUE 约束冲突返回正确的中文错误消息
- [ ] 非授权用户无法创建出库记录
