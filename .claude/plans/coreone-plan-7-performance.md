# Plan 7: 性能优化 — 详细实施计划

> **优先级**: P2
> **预估工时**: 8h
> **问题来源**: 后端视角 + 前端视角审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**用户**，我希望**页面加载快、列表不卡顿**，以便**高效完成工作**。

### 数据契约

| 指标 | 当前值 | 目标值 | 测量方式 |
|------|--------|--------|---------|
| 出库列表 API 响应时间 | ~800ms (N+1) | < 200ms | 1000 条数据 GET /outbound |
| 下拉选项加载时间 | ~1500ms (pageSize:999) | < 300ms | GET /materials/options |
| 分类树 API 响应时间 | ~500ms (N+1) | < 200ms | GET /categories/tree |
| 库存列表 API 响应时间 | ~600ms (关联子查询) | < 200ms | 1000 条数据 GET /inventory |
| options 接口首次加载 | N/A (未实现) | < 100ms | GET /suppliers/options |
| 前端 pageSize:999 调用数 | 20 处 | 0 处 | 代码搜索统计 |

### 边界契约
- **N+1 修复**: 使用 JOIN 或批量查询替代循环内查询
- **pageSize 优化**: 提供轻量 options 接口，只返回必要字段

### 验收标准
- [ ] 出库列表 API 响应 < 200ms（1000 条数据）
- [ ] 下拉选项加载 < 300ms

---

## 二、对抗性提示

### 边界 1: 批量查询 SQL 过长
**风险**: IN 子句参数过多（>1000）导致 SQL 过长
**测试**: 1000 条 ID 的 IN 查询，验证不报错

### 边界 2: options 接口数据不一致
**风险**: options 接口返回的数据与 list 接口不一致
**测试**: 对比 options 和 list 的物料数量

### 边界 3: 关联子查询改 JOIN 后结果不同
**风险**: JOIN 可能产生重复行
**测试**: 对比改前改后的查询结果

---

## 二-B、Red-Green-Refactor 测试要求

### 测试文件

**新增文件**: `后端代码/server/tests/integration/performance.test.ts`

### 测试代码示例

```typescript
import { describe, it, expect } from 'vitest'

describe('性能优化', () => {
  describe('N+1 查询修复', () => {
    it('出库列表 API 响应时间 < 200ms (1000 条)', async () => {
      const start = Date.now()
      const res = await request(app).get('/api/v1/outbound?page=1&pageSize=50').set('Authorization', adminToken)
      expect(Date.now() - start).toBeLessThan(200)
      expect(res.status).toBe(200)
    })

    it('出库列表每条记录包含 items', async () => {
      const res = await request(app).get('/api/v1/outbound?page=1&pageSize=10').set('Authorization', adminToken)
      for (const item of res.body.data.list) {
        expect(Array.isArray(item.items)).toBe(true)
      }
    })
  })

  describe('pageSize 优化', () => {
    it('options 接口响应时间 < 100ms', async () => {
      const start = Date.now()
      const res = await request(app).get('/api/v1/materials/options').set('Authorization', adminToken)
      expect(Date.now() - start).toBeLessThan(100)
      expect(res.status).toBe(200)
    })

    it('options 接口只返回必要字段', async () => {
      const res = await request(app).get('/api/v1/materials/options').set('Authorization', adminToken)
      const item = res.body.data[0]
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('name')
      expect(item).not.toHaveProperty('description')
    })
  })
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 写上述测试（含时间断言） | 测试失败（响应超时） |
| 2 | 运行测试 | 确认失败 |
| 3 | 优化查询 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |

**禁止**: 跳过 Step 1-2、使用 Mock、使用 toBeDefined

---

## 三、任务清单

### 任务 6.1: 修复 N+1 查询 (4h)

**问题**: 出库列表、分类树、对账病例每条记录单独查询

**文件**:
- `outbound-v1.1.ts` GET / — 每条出库单独查 items
- `categories-v1.1.ts` GET /tree — 每个分类单独 COUNT
- `reconciliation-v1.1.ts` GET /cases — 每条病例单独查项目

**改动示例**（出库列表）:

```typescript
// ❌ N+1：循环内查询
const list = db.prepare('SELECT * FROM outbound_records WHERE is_deleted = 0').all()
for (const item of list) {
  item.items = db.prepare('SELECT * FROM outbound_items WHERE outbound_id = ?').all(item.id)
}

// ✅ 批量查询
const list = db.prepare('SELECT * FROM outbound_records WHERE is_deleted = 0').all()
const ids = list.map(r => r.id)
if (ids.length > 0) {
  const items = db.prepare(`SELECT * FROM outbound_items WHERE outbound_id IN (${ids.map(() => '?').join(',')})`).all(...ids)
  const itemsByOutbound = groupBy(items, 'outbound_id')
  list.forEach(item => { item.items = itemsByOutbound[item.id] || [] })
}
```

---

### 任务 6.2: 优化 pageSize:999 全量加载 (3h)

**问题**: 20 处使用 pageSize:999 作为下拉选项

**方案**: 后端提供轻量 options 接口

**新增端点**:

| 端点 | 返回字段 |
|------|---------|
| GET /api/v1/materials/options | id, code, name, unit, stock |
| GET /api/v1/suppliers/options | id, name |
| GET /api/v1/locations/options | id, name, code |
| GET /api/v1/projects/options | id, name, type |

**验收标准**:
- [ ] options 接口只返回必要字段
- [ ] 前端使用 options 接口替代 pageSize:999

---

### 任务 6.3: 修复库存列表关联子查询 (1h)

**问题**: getBatchSubQuery 在 SELECT 中使用关联子查询

**改动**: 改为 LEFT JOIN

---

## 预估工时

| 任务 | 工时 |
|------|------|
| 6.1 N+1 查询 | 4h |
| 6.2 pageSize 优化 | 3h |
| 6.3 关联子查询 | 1h |
| **合计** | **8h** |

---

## 四、变更影响面报告

### 改动范围
- 修改文件: ~8 个后端路由文件
- 新增文件: 4 个 options 端点（嵌入现有路由）

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| 出库管理 | ✅ | 出库列表查询性能验证 |
| 分类管理 | ✅ | 分类树查询性能验证 |
| 对账管理 | ✅ | 对账病例查询性能验证 |
| 库存管理 | ✅ | 库存列表查询性能验证 |
| 入库管理 | ✅ | 物料下拉 options 加载验证 |
| BOM 管理 | ✅ | 物料/项目下拉 options 加载验证 |
| 采购订单 | ✅ | 供应商下拉 options 加载验证 |
| 盘点管理 | ✅ | 库位下拉 options 加载验证 |

### 回滚方案
| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 6.1 N+1 查询 | 恢复循环内单条查询 | 恢复 N+1 性能问题 |
| 6.2 pageSize 优化 | 删除 options 端点，恢复 pageSize:999 | 恢复全量加载 |
| 6.3 关联子查询 | 恢复 getBatchSubQuery 子查询 | 恢复关联子查询性能问题 |

## 五、PM 黑盒验收清单

### 功能正确性
- [ ] 出库列表正常加载，数据完整
- [ ] 分类树结构正确展开
- [ ] 所有下拉选项正确加载（物料、供应商、库位、项目）

### 数据一致性
- [ ] options 接口返回数据与 list 接口一致
- [ ] N+1 修复后出库列表的 items 数据完整
- [ ] 关联子查询改 JOIN 后库存数据无差异

### 异常处理
- [ ] 大数据量（1000+ 条）下接口响应 < 500ms
- [ ] IN 子句参数过多时分批查询不报错
- [ ] options 接口空数据时前端下拉显示正常
