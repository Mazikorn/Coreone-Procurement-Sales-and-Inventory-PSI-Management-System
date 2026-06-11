# Plan 1: 库存并发安全 — 详细实施计划

> **优先级**: P0（紧急修复）
> **预估工时**: 8h
> **问题来源**: 后端视角 + 产品视角审查
> **PM-QA-001 审查**: ✅ 已通过第一层+第二层+第三层防御

---

## 一、VibeContract（功能契约）

### 业务意图
作为**仓库管理员**，我希望**库存操作在并发场景下保持数据正确**，以便**库存数量始终准确，不会出现负数、虚高或被覆盖**。

### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| stock | INTEGER | inventory 表 | >= 0 | 100 |
| quantity | INTEGER | 操作数量 | > 0 | 10 |
| before_stock | INTEGER | 操作前库存 | >= 0 | 100 |
| after_stock | INTEGER | 操作后库存 | >= 0 | 90 |
| location_id | TEXT | inventory 表 | 非空 | "LOC-A01" |
| operator | TEXT | req.user.username | 非空 | "admin" |
| type | TEXT | stock_logs.type | 枚举 | "return_cancel" |

### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 并发退库撤销（两请求同时扣减同一物料） | 库存正确累加，不覆盖 | Critical |
| 2 | 退库撤销后库存为 0 | 允许，不报错 | High |
| 3 | 退库数量超过当前库存 | 事务回滚，返回错误 | High |
| 4 | 调拨撤销时原库位不存在 | 事务回滚，返回错误 | Medium |
| 5 | stock_logs before/after 值时序 | before 在 UPDATE 前读取 | High |
| 6 | 事务内检查库存后 ROLLBACK | 库存不变，连接释放 | Medium |

### 异常契约

| 场景 | 状态码 | 错误消息 | 处理方式 |
|------|--------|---------|---------|
| 库存不足 | 400 | "库存不足，当前可用: {stock}" | ROLLBACK 后返回 |
| 记录不存在 | 404 | "退库记录不存在" | 直接返回 |
| 库位不存在 | 404 | "原库位不存在" | ROLLBACK 后返回 |
| 数据库锁超时 | 503 | "系统繁忙，请稍后重试" | ROLLBACK 后返回 |
| 未知错误 | 500 | "操作失败" | ROLLBACK + 记录日志 |

### 验收标准（测试必须覆盖）

- [ ] **正常流程**: 退库→撤销，库存先+10再-10，最终回到原始值
- [ ] **边界值**: 退库数量=当前库存（撤销后库存为0）
- [ ] **并发场景**: 两请求同时撤销同一退库记录，库存正确（不双重扣减）
- [ ] **事务完整性**: 库存检查在事务内，ROLLBACK 后库存不变
- [ ] **stock_logs 正确性**: before_stock < after_stock（入库方向），before_stock > after_stock（出库方向）
- [ ] **调拨语义**: 调拨→撤销，库位恢复，库存不变

---

## 二、对抗性提示

基于契约，以下是 3 个最可能导致功能失效的边界情况：

### 边界 1: 并发撤销导致库存双重扣减

**场景**: 退库记录 quantity=10，当前库存=100。两个管理员同时点击"撤销"。
**风险**: 如果使用绝对值写入（`SET stock = ?`），两个请求都读到 beforeStock=100，都执行 `stock = 100 - 10 = 90`，最终库存=90（应为 80）。
**测试用例**:
```typescript
it('并发撤销同一退库记录，库存正确扣减', async () => {
  // 准备：退库 quantity=10，当前库存=100
  // 并发：两个 DELETE 请求同时执行
  const [res1, res2] = await Promise.all([
    request(app).delete(`/api/v1/returns/${returnId}`).set('Authorization', adminToken),
    request(app).delete(`/api/v1/returns/${returnId}`).set('Authorization', adminToken),
  ])
  // 一个成功，一个失败（记录已删除）
  expect(res1.status + res2.status).toBe(200 + 404)
  // 库存 = 100 - 10 = 90（只扣减一次）
  const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId)
  expect(inv.stock).toBe(90)
})
```

### 边界 2: TOCTOU — 事务外检查库存后并发扣减

**场景**: 物料 A 库存=5。请求 1 退库 3 个，请求 2 退库 4 个，几乎同时到达。
**风险**: 两个请求都在事务外读到库存=5，都通过检查（5>=3, 5>=4）。进入事务后，请求 1 扣减为 2，请求 2 扣减为 -2（负库存）。
**测试用例**:
```typescript
it('并发退库不出现负库存', async () => {
  // 准备：库存=5
  // 并发：退库 3 + 退库 4
  const [res1, res2] = await Promise.all([
    request(app).post('/api/v1/returns').send({ materialId, quantity: 3, ... }),
    request(app).post('/api/v1/returns').send({ materialId, quantity: 4, ... }),
  ])
  // 一个成功，一个失败（库存不足）
  const successCount = [res1, res2].filter(r => r.status === 201).length
  expect(successCount).toBe(1)
  // 库存 >= 0
  const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId)
  expect(inv.stock).toBeGreaterThanOrEqual(0)
})
```

### 边界 3: 调拨撤销不恢复库位

**场景**: 物料 A 在库位 LOC-A01，调拨到 LOC-B02，然后撤销。
**风险**: 撤销后库位仍为 LOC-B02（未恢复），且库存被错误扣减（调拨本身不改库存）。
**测试用例**:
```typescript
it('调拨撤销后库位恢复且库存不变', async () => {
  // 准备：物料 A 在 LOC-A01，库存=100
  // 执行：调拨到 LOC-B02
  // 执行：撤销调拨
  // 验证：库位 = LOC-A01
  const inv = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId)
  expect(inv.location_id).toBe('LOC-A01')
  expect(inv.stock).toBe(100) // 库存不变
})
```

### 契约遗漏检查

| 可能遗漏 | 状态 | 说明 |
|---------|------|------|
| 盘算撤销恢复到系统原始值是否合理 | ⚠️ 需确认 | stocktaking DELETE 恢复到 record.system_stock，需确认这是有意设计 |
| 出库撤销是否也需要 TOCTOU 修复 | ✅ 已确认 | 出库撤销使用相对增量，无 TOCTOU 问题 |
| 退库撤销是否需要检查"撤销后库存不会溢出" | ⚠️ 需确认 | INTEGER 无上限，但业务上可能有最大库存限制 |

---

## 三、测试要求（先写测试再写实现）

### 集成测试文件

**新增文件**: `后端代码/server/tests/integration/inventory-concurrency.test.ts`

**要求**:
- 使用 `:memory:` SQLite 数据库（非 Mock）
- 每个测试前初始化表结构和种子数据
- 测试结束后自动清理

### 测试用例清单（必须先写，预期失败）

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

describe('库存并发安全', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    // 初始化表结构
    db.exec(`
      CREATE TABLE inventory (material_id TEXT PRIMARY KEY, stock INTEGER, location_id TEXT);
      CREATE TABLE return_records (id TEXT PRIMARY KEY, is_deleted INTEGER DEFAULT 0);
      CREATE TABLE return_items (id TEXT PRIMARY KEY, return_id TEXT, material_id TEXT, quantity INTEGER);
      CREATE TABLE stock_logs (id TEXT PRIMARY KEY, material_id TEXT, type TEXT, before_stock INTEGER, after_stock INTEGER);
      -- 其他必要表...
    `)
    // 种子数据
    db.prepare('INSERT INTO inventory VALUES (?, ?, ?)').run('MAT-001', 100, 'LOC-A01')
  })

  describe('任务 1.1: TOCTOU 竞态条件', () => {
    it('库存检查在事务内，并发请求不出现负库存', async () => {
      // 两个并发退库请求，总量超过库存
      // 预期：一个成功，一个失败，库存 >= 0
    })
  })

  describe('任务 1.2: 相对增量写入', () => {
    it('并发撤销操作库存正确累加', async () => {
      // 两个并发撤销，库存正确增加两次
    })
  })

  describe('任务 1.3: 退库撤销方向', () => {
    it('退库撤销后库存减少（不增加）', async () => {
      // 退库 quantity=10，库存从 100 增加到 110
      // 撤销后库存从 110 减少到 100
      expect(afterCancelStock).toBe(100)
    })
  })

  describe('任务 1.4: 调拨撤销', () => {
    it('调拨撤销后库位恢复且库存不变', async () => {
      // 调拨不改库存，撤销也不改库存
      // 撤销后库位恢复原值
    })
  })

  describe('任务 1.5: stock_logs 时序', () => {
    it('stock_logs before/after 值正确', async () => {
      // 出库撤销：before = 恢复前库存，after = 恢复后库存
      expect(log.before_stock).toBe(90)
      expect(log.after_stock).toBe(100)
    })
  })
})
```

### Red-Green-Refactor 要求

| Step | 操作 | 预期结果 |
|------|------|---------|
| 1 | 写上述测试用例 | 测试失败（功能缺失） |
| 2 | 运行测试，提供失败日志 | 确认失败原因是"功能缺失"而非"语法错误" |
| 3 | 写最小实现使测试通过 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |
| 5 | 添加边界/异常测试 | 全部通过 |

**禁止**：跳过 Step 1-2 直接写实现。

---

## 四、任务清单

### 任务 1.1: 修复 TOCTOU 竞态条件 — 库存检查移入事务

**文件**:
- `后端代码/server/src/routes/returns-v1.1.ts` (POST /)
- `后端代码/server/src/routes/scraps-v1.1.ts` (POST /)
- `后端代码/server/src/routes/supplier-returns-v1.1.ts` (POST /)

**改动内容**:

```typescript
// ❌ 错误：库存检查在事务外
const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId)
if (inv.stock < quantity) return error(res, 400, '库存不足')
db.exec('BEGIN IMMEDIATE')
try {

// ✅ 正确：库存检查在事务内
db.exec('BEGIN IMMEDIATE')
try {
  const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId)
  if (inv.stock < quantity) {
    db.exec('ROLLBACK')
    return error(res, 400, `库存不足，当前可用: ${inv.stock}`)
  }
  // 扣减库存...
} catch (err) {
  db.exec('ROLLBACK')
  throw err
}
```

**验收标准**:
- [ ] 三个文件的库存检查都在 `BEGIN IMMEDIATE` 之后
- [ ] 库存不足时先 ROLLBACK 再返回错误
- [ ] 集成测试通过（并发不出现负库存）

---

### 任务 1.2: 修复绝对值写入库存 — 改为相对增量

**文件**:
- `后端代码/server/src/routes/returns-v1.1.ts` (DELETE /:id, line 158)
- `后端代码/server/src/routes/scraps-v1.1.ts` (DELETE /:id, line 88)
- `后端代码/server/src/routes/stocktaking-v1.1.ts` (DELETE /:id, line 93)
- `后端代码/server/src/routes/supplier-returns-v1.1.ts` (DELETE /:id, line 267)
- `后端代码/server/src/routes/transfers-v1.1.ts` (DELETE /:id, line 126)

**改动内容**:

```typescript
// ❌ 错误：绝对值写入
const afterStock = beforeStock + record.quantity
db.prepare('UPDATE inventory SET stock = ? WHERE material_id = ?').run(afterStock, record.material_id)

// ✅ 正确：相对增量
db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(record.quantity, record.material_id)
```

**验收标准**:
- [ ] 5 个文件全部改为 `stock = stock + ?` 或 `stock = stock - ?`
- [ ] 集成测试通过（并发撤销库存正确累加）

---

### 任务 1.3: 修复退库撤销方向错误

**文件**: `后端代码/server/src/routes/returns-v1.1.ts` (DELETE /:id, line 158)

**改动内容**:

```typescript
// ❌ 错误：退库撤销增加了库存（应减少）
const afterStock = beforeStock + record.quantity

// ✅ 正确：退库撤销应减少库存
db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(record.quantity, record.material_id)
```

**验收标准**:
- [ ] 退库撤销后库存正确减少
- [ ] 集成测试通过（退库→撤销，库存回到原始值）

---

### 任务 1.4: 修复调拨撤销逻辑（双重错误）

**问题**: 原始调拨只改库位不改库存，但撤销时扣减了库存且不恢复库位

**文件**: `后端代码/server/src/routes/transfers-v1.1.ts` (DELETE /:id)

**改动内容**:

```typescript
// ❌ 错误：调拨撤销扣减了库存（调拨本身不改库存）
const afterStock = beforeStock - record.quantity
db.prepare('UPDATE inventory SET stock = ? WHERE material_id = ?').run(afterStock, record.material_id)

// ✅ 正确：调拨撤销只恢复库位，不改变库存
// 1. 查找调拨记录的原始库位
const fromLocationId = db.prepare(`
  SELECT from_location_id FROM transfer_records WHERE id = ?
`).get(id)?.from_location_id

if (!fromLocationId) {
  db.exec('ROLLBACK')
  return error(res, 404, '原库位信息不存在，无法撤销')
}

// 2. 恢复原库位（不改库存）
db.prepare('UPDATE inventory SET location_id = ? WHERE material_id = ?')
  .run(fromLocationId, record.material_id)
```

**注意**: 需确认 `transfer_records` 或 `stock_logs` 中是否存储了 `from_location_id`。如果没有，需要先补充该字段。

**验收标准**:
- [ ] 调拨撤销后库位恢复到原始位置
- [ ] 调拨撤销不改变库存数量
- [ ] 集成测试通过

---

### 任务 1.5: 统一 stock_logs 记录时机

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts` (DELETE /:id, lines 578-597)

**改动内容**:

```typescript
// ❌ 错误：先 UPDATE 再读取 before
db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
const afterStock = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(item.material_id)

// ✅ 正确：先读取 before，再 UPDATE
const beforeResult = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(item.material_id)
const beforeStock = beforeResult.stock
db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
const afterStock = beforeStock + item.quantity

// 记录 stock_logs
db.prepare(`INSERT INTO stock_logs (...) VALUES (...)`).run(
  item.material_id, 'outbound_cancel', beforeStock, afterStock, ...
)
```

**验收标准**:
- [ ] stock_logs 的 before_stock 和 after_stock 正确
- [ ] 集成测试通过

---

## 五、变更影响面报告

### 改动范围
- 修改文件: 6 个后端路由文件
- 新增文件: 1 个集成测试文件

### 影响功能
| 功能 | 是否受影响 | 验证方式 | 测试文件 |
|------|-----------|---------|---------|
| 退库 | ✅ | 退库→撤销 完整流程 | inventory-concurrency.test.ts |
| 报废 | ✅ | 报废→撤销 完整流程 | inventory-concurrency.test.ts |
| 调拨 | ✅ | 调拨→撤销 完整流程 | inventory-concurrency.test.ts |
| 盘点 | ✅ | 盘点→删除 完整流程 | inventory-concurrency.test.ts |
| 供应商退货 | ✅ | 退货→撤销 完整流程 | inventory-concurrency.test.ts |
| 出库 | ✅ | 出库→撤销 完整流程 | inventory-concurrency.test.ts |
| 入库 | ❌ | 无需验证 | - |

### 回滚方案

每个任务独立，可单独回滚：

| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 1.1 TOCTOU | 将库存检查移回事务外 | 恢复并发风险 |
| 1.2 相对增量 | 恢复 `SET stock = ?` 写法 | 恢复并发覆盖风险 |
| 1.3 退库方向 | 恢复 `beforeStock + quantity` | 恢复方向错误 |
| 1.4 调拨逻辑 | 恢复原始扣减逻辑 | 恢复双重错误 |
| 1.5 stock_logs | 恢复先 UPDATE 再读 before | 恢复时序错误 |

**回滚验证**: 回滚后运行 `npm run test`，确认所有测试通过。

---

## 六、PM 黑盒验收清单

### 功能正确性
- [ ] 退库后库存增加，撤销后库存减少，最终回到原始值
- [ ] 调拨后库位变更，撤销后库位恢复，库存始终不变
- [ ] 报废后库存减少，撤销后库存增加，最终回到原始值
- [ ] 盘点调整后库存变更，删除盘点记录后库存恢复

### 数据一致性
- [ ] 退库→撤销 后，库存列表数据与操作一致
- [ ] 调拨→撤销 后，库位信息与操作一致
- [ ] stock_logs 的 before/after 值与实际操作一致
- [ ] 刷新页面后数据仍然正确

### 权限安全
- [ ] 非 admin/warehouse_manager 无法执行撤销操作
- [ ] 撤销操作记录正确的 operator（当前登录用户）

### 异常处理
- [ ] 撤销不存在的记录，返回 404
- [ ] 退库数量超过当前库存，返回 400 且库存不变
- [ ] 数据库锁超时，返回 503 且数据一致

### 性能体感
- [ ] 撤销操作响应时间 < 500ms
- [ ] 并发 10 个撤销请求不出现超时

---

## 七、执行顺序

```
Step 1: 写集成测试（inventory-concurrency.test.ts）→ 运行 → 确认失败
Step 2: 修复任务 1.1（TOCTOU）→ 运行测试 → 确认通过
Step 3: 修复任务 1.2（相对增量）→ 运行测试 → 确认通过
Step 4: 修复任务 1.3（退库方向）→ 运行测试 → 确认通过
Step 5: 修复任务 1.4（调拨逻辑）→ 运行测试 → 确认通过
Step 6: 修复任务 1.5（stock_logs）→ 运行测试 → 确认通过
Step 7: 运行全量测试 → 确认无回归
Step 8: PM 黑盒验收
```
