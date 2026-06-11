# Plan 3: 前端代码质量 — 详细实施计划

> **优先级**: P1
> **预估工时**: 20h
> **问题来源**: 前端视角审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**前端开发者**，我希望**代码类型安全、API 层统一、组件复用**，以便**减少运行时错误、提高可维护性**。

### 数据契约

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| any 使用数 | number | < 30 处 | 当前 159 处 |
| API 模块数 | number | >= 33 | 当前 25 个模块 |
| 内联 Modal 数 | number | 0 | 当前 5 个页面有 |

### 边界契约
- **any 消除**: 逐文件处理，不一次性重构全部
- **API 层**: 新增模块不影响现有 API 调用
- **Modal 替换**: 替换后交互行为不变

### 验收标准
- [ ] any 使用 < 30 处
- [ ] 所有页面使用 API 层
- [ ] 无内联 Modal

---

## 二、对抗性提示

### 边界 1: any 消除引入类型错误
**风险**: 定义的类型与实际 API 返回不匹配
**测试**: 消除 any 后运行 `npx tsc --noEmit`，无新增类型错误

### 边界 2: API 模块命名冲突
**风险**: 新增的 alerts.ts 与已有模块命名冲突
**测试**: 检查 api/ 目录无重复文件名

### 边界 3: Modal 替换后 ESC/遮罩行为变化
**风险**: 手写 Modal 有自定义关闭逻辑，替换后丢失
**测试**: E2E 测试验证 ESC 键和遮罩点击关闭

---

## 二-B、Red-Green-Refactor 测试要求

### 测试代码示例

```typescript
import { describe, it, expect } from 'vitest'

describe('API 层统一', () => {
  it('alertsApi.getList 返回正确结构', async () => {
    const res = await alertsApi.getList({ page: 1, pageSize: 10 })
    expect(typeof res.pagination.total).toBe('number')
    expect(Array.isArray(res.list)).toBe(true)
  })
})

describe('Modal 组件替换', () => {
  it('ESC 键关闭弹窗', async () => {
    // 渲染 Modal → 按 ESC → 验证 onClose 被调用
  })
  it('点击遮罩关闭弹窗', async () => {
    // 渲染 Modal → 点击遮罩 → 验证 onClose 被调用
  })
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 写上述测试 | 测试失败（API 模块不存在） |
| 2 | 运行测试 | 确认失败 |
| 3 | 创建 API 模块 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |

**禁止**: 跳过 Step 1-2、使用 Mock、使用 toBeDefined

---

## 三、任务清单

### 任务 3.1: 消除 any 类型泛滥 (8h)

**问题**: 159 处 `any` 使用，分布在 32 个文件中

**优先处理文件**（按 any 数量排序）:

| 文件 | any 数 | 处理方式 |
|------|--------|---------|
| useBOMPage.ts | 15 | 定义 BOM 相关类型 |
| useInventoryPage.ts | 14 | 定义 InventoryItem 类型 |
| useReconciliationPage.ts | 10 | 定义 Reconciliation 类型 |
| useInboundPage.ts | 6 | 使用已有 InboundRecord 类型 |
| SupplierReturns.tsx | 5 | 使用已有 SupplierReturn 类型 |

**改动示例**:

```typescript
// ❌ 错误
const res: any = await materialApi.getList({ page: 1, pageSize: 999 })
const [depletionTracking, setDepletionTracking] = useState<any[]>([])

// ✅ 正确
const res = await materialApi.getList({ page: 1, pageSize: 999 })
const [depletionTracking, setDepletionTracking] = useState<DepletionTracking[]>([])
```

**验收标准**:
- [ ] any 使用减少到 < 30 处
- [ ] 所有 API 返回值有类型定义
- [ ] 所有 useState 有类型定义

---

### 任务 3.2: 创建缺失的 API 模块 (4h)

**问题**: 8 个页面直接调用 request，绕过 API 层

**新增文件**:
- `前端代码/src/api/alerts.ts`
- `前端代码/src/api/stocktaking.ts`
- `前端代码/src/api/users.ts`
- `前端代码/src/api/roles.ts`
- `前端代码/src/api/logs.ts`
- `前端代码/src/api/reconciliation.ts`
- `前端代码/src/api/reports.ts`

**改动示例**（alerts.ts）:

```typescript
import request from './request'

export const alertsApi = {
  getList: (params?: { page?: number; pageSize?: number; status?: string }) =>
    request.get('/alerts', { params }),
  
  getById: (id: string) =>
    request.get(`/alerts/${id}`),
  
  process: (id: string, data: { action: string; remark?: string }) =>
    request.post(`/alerts/${id}/process`, data),
  
  batchProcess: (ids: string[]) =>
    request.post('/alerts/batch-process', { ids }),
}
```

**验收标准**:
- [ ] 所有页面使用 API 层，不再直接 import request
- [ ] API 函数有返回类型定义

---

### 任务 3.3: 替换内联 Modal 为通用组件 (4h)

**问题**: 5 个页面手写了重复的 Modal 代码

**影响文件**:
- Scraps.tsx (~100 行重复)
- Returns.tsx (~100 行重复)
- Transfers.tsx (~100 行重复)
- PurchaseOrders.tsx (~150 行重复)
- SupplierReturns.tsx (~200 行重复)

**改动示例**:

```tsx
// ❌ 错误：手写 Modal
{showCreate && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-xl shadow-lg w-[600px] max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2>新建退库</h2>
        <button onClick={() => setShowCreate(false)}>×</button>
      </div>
      {/* ... 表单内容 ... */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t">
        <button onClick={() => setShowCreate(false)}>取消</button>
        <button onClick={handleCreate}>确认退库</button>
      </div>
    </div>
  </div>
)}

// ✅ 正确：使用 Modal 组件
<Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新建退库">
  {/* ... 表单内容 ... */}
  <div className="flex justify-end gap-3 mt-6">
    <button onClick={() => setShowCreate(false)}>取消</button>
    <button onClick={handleCreate}>确认退库</button>
  </div>
</Modal>
```

**验收标准**:
- [ ] 5 个页面的内联 Modal 替换为 Modal/ConfirmDialog 组件
- [ ] 减少约 500 行重复代码
- [ ] ESC 键和遮罩点击关闭功能正常

---

### 任务 3.4: 提取 useReferenceData 公共 Hook (3h)

**问题**: 7 个页面有相同的"加载下拉选项"逻辑

**新增文件**: `前端代码/src/hooks/useReferenceData.ts`

```typescript
export function useReferenceData(entities: Array<'materials' | 'suppliers' | 'locations' | 'projects' | 'purchaseOrders'>) {
  const [data, setData] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const results: Record<string, any[]> = {}
      await Promise.all(
        entities.map(async (entity) => {
          const api = getApiForEntity(entity)
          const res = await api.getList({ page: 1, pageSize: 100 })
          results[entity] = res.list || res.items || []
        })
      )
      setData(results)
      setLoading(false)
    }
    load()
  }, [])

  return { ...data, loading }
}
```

**验收标准**:
- [ ] 7 个页面使用 useReferenceData
- [ ] 下拉选项加载逻辑统一

---

### 任务 3.5: 修复重复 Toast 错误提示 (1h)

**问题**: request 拦截器已 toast，页面 catch 又 toast

**改动**: 页面 catch 块移除 toast.error，只做 silent fallback

```typescript
// ❌ 错误：双重 toast
try {
  await supplierReturnApi.create(data)
} catch (e: any) {
  toast.error(e?.response?.data?.message || '创建失败')  // 与拦截器重复
}

// ✅ 正确：拦截器已处理 toast
try {
  await supplierReturnApi.create(data)
} catch (e) {
  // 拦截器已 toast，此处只做业务逻辑处理
}
```

**验收标准**:
- [ ] 错误时只显示一个 toast
- [ ] 页面 catch 块不重复 toast

---

## 预估工时

| 任务 | 工时 |
|------|------|
| 3.1 消除 any 类型 | 8h |
| 3.2 创建 API 模块 | 4h |
| 3.3 替换内联 Modal | 4h |
| 3.4 提取 useReferenceData | 3h |
| 3.5 修复重复 Toast | 1h |
| **合计** | **20h** |

---

## 六、变更影响面报告

### 改动范围
- 修改文件: ~15 个前端文件
- 新增文件: 7 个 API 模块文件

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| 入库管理 | ✅ | 入库页面 API 调用验证 |
| 出库管理 | ✅ | 出库页面 API 调用验证 |
| 库存管理 | ✅ | 库存页面 API 调用验证 |
| BOM 管理 | ✅ | BOM 页面 API 调用验证 |
| 预警管理 | ✅ | 预警页面 API 调用验证 |
| 系统管理 | ✅ | 用户/角色/日志页面验证 |

### 回滚方案
| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 3.1 消除 any | 恢复 any 类型 | 恢复类型不安全 |
| 3.2 创建 API 模块 | 删除 api/ 新文件 | 恢复直接 fetch |
| 3.3 替换 Modal | 恢复内联弹窗 | 恢复重复代码 |
| 3.4 提取 Hook | 删除 useReferenceData | 恢复重复逻辑 |
| 3.5 修复 Toast | 恢复双重 toast | 恢复重复提示 |

## 七、PM 黑盒验收清单

### 功能正确性
- [ ] 所有页面 API 调用正常
- [ ] Modal 弹窗 ESC/遮罩关闭正常
- [ ] 下拉选项正确加载

### 数据一致性
- [ ] API 层返回类型与页面使用一致
- [ ] 无 any 类型导致的运行时错误

### 异常处理
- [ ] API 错误只显示一个 toast
- [ ] 网络超时有友好提示
