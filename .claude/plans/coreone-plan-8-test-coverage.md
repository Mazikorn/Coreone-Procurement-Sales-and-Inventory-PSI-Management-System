# Plan 8: 测试覆盖提升 — 详细实施计划

> **优先级**: P2
> **预估工时**: 20h
> **问题来源**: 测试视角审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**技术负责人**，我希望**核心模块有测试保护**，以便**重构和修复时不引入回归**。

### 数据契约

| 指标 | 目标值 | 当前值 |
|------|--------|--------|
| 有测试的后端路由 | 27/27 | 12/27 (44%) |
| 测试框架统一 | Vitest 100% | 自定义框架 12 个 |
| 集成测试硬编码路径 | 0 | 1 |
| E2E 空壳测试 | 0 | ~30-40% |

### 边界契约
- **迁移优先**: 先迁移框架，再补充测试
- **不破坏现有**: 迁移过程中现有测试必须继续通过

### 验收标准
- [ ] 所有后端路由有对应测试
- [ ] 所有测试使用 Vitest
- [ ] 无硬编码路径
- [ ] E2E 测试无空壳

---

## 二、对抗性提示

### 边界 1: 测试迁移后行为变化
**风险**: 自定义框架的 assertTrue 与 Vitest 的 expect 行为不同
**测试**: 迁移前后运行相同测试，结果一致

### 边界 2: 新增测试依赖种子数据
**风险**: 测试依赖预置数据，CI 环境无种子数据
**测试**: 在空数据库上运行测试，验证自包含

### 边界 3: E2E 空壳测试删除后覆盖率下降
**风险**: 删除空壳测试后覆盖率数字下降
**测试**: 删除前记录覆盖率，删除后确认真实覆盖率不降

### 边界 4: 宽松断言收紧后测试大面积失败
**风险**: `expect([201, 400, 422]).toContain(res.status)` 收紧为 `expect(res.status).toBe(201)` 后，原本"通过"的测试暴露出真实 bug
**测试**: 收紧前记录通过率，收紧后逐个排查失败用例，区分"断言过松掩盖 bug"和"测试环境差异"

---

## 二-B、Red-Green-Refactor 测试要求

### 迁移验证测试

```typescript
import { describe, it, expect } from 'vitest'

describe('测试框架迁移验证', () => {
  it('vitest 能运行所有后端测试', async () => {
    // 运行 npx vitest run --reporter=json
    // 验证：无 "no test files found" 错误
  })

  it('迁移前后测试结果一致', async () => {
    // 记录迁移前的通过/失败数
    // 迁移后运行 vitest
    // 验证：通过数 >= 迁移前
  })
})

describe('集成测试数据隔离', () => {
  it('测试间数据不互相污染', async () => {
    // 测试 A 插入数据 → 测试 B 查询 → 验证看不到 A 的数据
  })
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 迁移 1 个测试文件到 vitest | 测试可运行 |
| 2 | 运行对比 | 结果一致 |
| 3 | 迁移其余文件 | 全部通过 |
| 4 | 运行全量测试 | 无回归 |

**禁止**: 使用 toBeDefined、使用 Mock 数据库

---

## 三、任务清单

### 任务 7.1: 迁移后端测试到 Vitest (8h)

**问题**: 12 个后端 API 测试使用自定义框架

**改动**: 迁移到 Vitest + supertest

**影响文件**: 所有 12 个后端 API 测试文件

**改动示例**:

```typescript
// ❌ 旧：自定义框架
import { run, assertTrue, assertEqual } from '../test-runner.js'
run('admin 获取列表', async () => {
  const res = await fetch(`${BASE}/api/v1/inventory?page=1&pageSize=10`, { headers })
  assertTrue(res.ok)
})

// ✅ 新：Vitest + supertest
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'

describe('库存管理', () => {
  it('admin 获取列表', async () => {
    const res = await request(app)
      .get('/api/v1/inventory?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.list).toBeDefined()
  })
})
```

---

### 任务 7.2: 补充核心模块后端测试 (8h)

**问题**: 14 个路由模块无测试

**按优先级补充**:

| 优先级 | 模块 | 测试用例数 |
|--------|------|-----------|
| P0 | stocktaking-v1.1.ts | 10 |
| P0 | bom-v1.1.ts | 12 |
| P1 | reports-v1.1.ts | 8 |
| P1 | returns-v1.1.ts | 8 |
| P1 | scraps-v1.1.ts | 6 |
| P2 | equipment-v1.1.ts | 6 |
| P2 | transfers-v1.1.ts | 6 |
| P2 | alerts-v1.1.ts | 6 |

---

### 任务 7.3: 修复集成测试硬编码路径 (1h)

**问题**: pathology-real-workflow.test.ts 硬编码绝对路径

**改动**:

```typescript
// ❌ 错误
const seedPath = path.resolve('d:/Git/COREONE/最新代码/.claude/research/pathology-seed-data.sql')

// ✅ 正确
const seedPath = path.resolve(__dirname, '../../../.claude/research/pathology-seed-data.sql')
```

---

### 任务 7.4: 清理 E2E 空壳测试 (2h)

**问题**: 30-40% 的 E2E 用例无有意义断言

**改动**: 删除或重写空壳测试

**验收标准**:
- [ ] 每个 E2E 测试至少有一个有意义的断言
- [ ] 移除 `expect(page.locator('body')).toBeVisible()` 等无意义断言

---

### 任务 7.5: 收紧 E2E 宽松断言 (1h)

**问题**: `expect([201, 400, 422]).toContain(res.status)` 过于宽松

**改动**: 明确每个测试的期望状态码

---

## 预估工时

| 任务 | 工时 |
|------|------|
| 7.1 迁移测试框架 | 8h |
| 7.2 补充核心测试 | 8h |
| 7.3 修复硬编码路径 | 1h |
| 7.4 清理空壳测试 | 2h |
| 7.5 收紧宽松断言 | 1h |
| **合计** | **20h** |

---

## 四、变更影响面报告

### 改动范围
- 修改文件: ~15 个测试文件
- 新增文件: ~14 个后端路由测试文件

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| 库存管理 | ✅ | 新增集成测试验证 |
| 盘点管理 | ✅ | 新增集成测试验证 |
| BOM 管理 | ✅ | 新增集成测试验证 |
| 报表管理 | ✅ | 新增集成测试验证 |
| 退库管理 | ✅ | 新增集成测试验证 |
| 报废管理 | ✅ | 新增集成测试验证 |
| 设备管理 | ✅ | 新增集成测试验证 |
| 调拨管理 | ✅ | 新增集成测试验证 |
| 预警管理 | ✅ | 新增集成测试验证 |
| E2E 流程 | ✅ | 空壳清理 + 断言收紧验证 |

### 回滚方案
| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 7.1 迁移测试框架 | 恢复自定义 test-runner | 恢复框架不统一 |
| 7.2 补充核心测试 | 删除新增测试文件 | 恢复测试覆盖不足 |
| 7.3 修复硬编码路径 | 恢复绝对路径 | 恢复 CI 环境不兼容 |
| 7.4 清理空壳测试 | 恢复空壳测试 | 恢复虚假覆盖率 |
| 7.5 收紧宽松断言 | 恢复 toContain 松散断言 | 恢复掩盖真实 bug |

## 五、PM 黑盒验收清单

### 功能正确性
- [ ] 所有后端路由有对应 Vitest 测试
- [ ] 测试在空数据库上自包含运行
- [ ] 集成测试无硬编码路径

### 数据一致性
- [ ] 迁移后测试结果与迁移前一致
- [ ] 新增测试覆盖所有核心业务流程
- [ ] E2E 测试每个用例有有意义的断言

### 异常处理
- [ ] 测试失败时有清晰的错误信息
- [ ] CI 环境测试可正常运行
- [ ] 宽松断言收紧后失败用例已逐个排查修复
