# Plan 4: UI/UX 一致性 — 详细实施计划

> **优先级**: P1
> **预估工时**: 16h
> **问题来源**: 设计交互视角 + 用户视角审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**用户**，我希望**所有页面的视觉和交互风格一致**，以便**降低学习成本、提升使用效率**。

### 数据契约

| 指标 | 目标值 | 当前值 |
|------|--------|--------|
| 统计卡片样式数 | <= 2 | 5+ |
| 弹窗实现方式数 | 1 (Modal 组件) | 3 |
| 空状态样式数 | 1 | 3+ |
| 按钮高度一致性 | 100% h-10 | ~70% |

### 边界契约
- **渐进式修改**: 不一次性重构所有页面
- **向后替换**: Modal 组件行为 >= 手写弹窗

### 验收标准
- [ ] 统计卡片 <= 2 种样式
- [ ] 所有弹窗使用 Modal/ConfirmDialog 组件
- [ ] 所有空状态使用 EmptyState 组件

---

## 二、对抗性提示

### 边界 1: 统计卡片样式统一后 Alerts 颜色标识丢失
**风险**: Alerts 的 `border-l-4 border-red-500` 被移除后，预警不醒目
**测试**: 验证 Alerts 页面仍有红色视觉提示（如图标颜色）

### 边界 2: Modal 替换后表单数据丢失
**风险**: 手写弹窗关闭时有自定义清理逻辑，替换后可能丢失
**测试**: 填写表单→关闭→重新打开，验证表单重置

### 边界 3: 空状态组件在窄屏溢出
**风险**: 12x12 图标在小屏幕上可能溢出
**测试**: 移动端视口下验证空状态显示

---

## 二-B、Red-Green-Refactor 测试要求

### 测试代码示例 (Playwright E2E)

```typescript
import { test, expect } from '@playwright/test'

test('所有主按钮使用 blue-500', async ({ page }) => {
  await page.goto('/inbound')
  const btn = page.locator('button').filter({ hasText: '新增入库' })
  await expect(btn).toHaveClass(/bg-blue-500/)
})

test('弹窗 ESC 键关闭', async ({ page }) => {
  await page.goto('/returns')
  await page.click('button:has-text("新建退库")')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})

test('空状态显示引导语', async ({ page }) => {
  await page.goto('/transfers')
  await expect(page.locator('text=暂无数据')).toBeVisible()
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 写上述 E2E 测试 | 测试失败（样式不一致） |
| 2 | 运行测试 | 确认失败 |
| 3 | 修复样式 | 测试通过 |
| 4 | 运行全量 E2E | 无回归 |

---

## 三、任务清单

### 任务 4.1: 统一统计卡片样式 (4h)

**问题**: 5 种以上不同的统计卡片样式

**方案**: 统一为两种标准样式

| 样式 | 用途 | 类名 |
|------|------|------|
| StatCard | Dashboard、带图标 | 使用现有 StatCard 组件 |
| 标准卡片 | 列表页统计 | `bg-white rounded-lg p-5 border border-gray-200 shadow-sm` |

**改动文件**:
- Alerts.tsx — 移除 `border-l-4 border-red-500`
- Stocktaking.tsx — 移除 `border border-blue-100`
- Logs.tsx — 统一边框和阴影

**验收标准**:
- [ ] 所有统计卡片使用统一的两种样式
- [ ] 移除 Alerts 的左侧彩色边框

---

### 任务 4.2: 统一按钮样式 (2h)

**问题**: 按钮颜色 (blue-600 vs blue-500) 和高度 (有无 h-10) 不统一

**改动文件**:
- BOM.tsx — `bg-blue-600` 改为 `bg-blue-500`
- SupplierReturns.tsx — `bg-blue-600` 改为 `bg-blue-500`
- Returns.tsx, Transfers.tsx, Scraps.tsx, Materials.tsx — 添加 `h-10`

**验收标准**:
- [ ] 所有主按钮使用 `bg-blue-500 hover:bg-blue-600`
- [ ] 所有按钮高度为 `h-10`

---

### 任务 4.3: 统一空状态处理 (2h)

**问题**: 大部分页面空状态只有"暂无数据"

**方案**: 统一为空状态组件

**新增组件**: `前端代码/src/components/ui/EmptyState.tsx`

```tsx
export function EmptyState({ icon: Icon = Package, title = '暂无数据', description }: {
  icon?: React.ComponentType<any>
  title?: string
  description?: string
}) {
  return (
    <div className="py-12 text-center">
      <Icon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  )
}
```

**改动文件**: Returns, Transfers, Scraps, PurchaseOrders, EquipmentList, LaborTimeList

**验收标准**:
- [ ] 所有列表页面使用 EmptyState 组件
- [ ] 空状态显示图标 + 主提示 + 副引导语

---

### 任务 4.4: 统一页面间距 (1h)

**问题**: space-y-5 vs space-y-6 不统一

**改动文件**: Inbound, BOM, EquipmentList, LaborTimeList, Materials

**改动**: `space-y-5` 统一改为 `space-y-6`

**验收标准**:
- [ ] 所有页面使用 `space-y-6`

---

### 任务 4.5: 统一表单弹窗按钮 (1h)

**问题**: 确认按钮文案不统一

**方案**: 统一为 `ConfirmDialog` 的 `confirmText` 属性

**验收标准**:
- [ ] 确认按钮文案统一为"确认" + 动作描述

---

### 任务 4.6: 统一加载状态 (2h)

**问题**: 骨架屏 vs "加载中..." vs 图标旋转

**方案**: 表格页面使用统一的 Spinner 组件

**验收标准**:
- [ ] 加载状态统一使用 Spinner 或骨架屏

---

### 任务 4.7: 修复 Logs 统计卡片响应式 (0.5h)

**问题**: `grid grid-cols-4` 无响应式断点

**改动**: 改为 `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`

---

### 任务 4.8: 添加 Modal aria-label (0.5h)

**问题**: Modal 关闭按钮缺少 aria-label

**改动**: 添加 `aria-label="关闭"`

---

## 预估工时

| 任务 | 工时 |
|------|------|
| 4.1 统计卡片 | 4h |
| 4.2 按钮样式 | 2h |
| 4.3 空状态 | 2h |
| 4.4 页面间距 | 1h |
| 4.5 按钮文案 | 1h |
| 4.6 加载状态 | 2h |
| 4.7 响应式 | 0.5h |
| 4.8 无障碍 | 0.5h |
| **合计** | **13h** |

---

## 四、变更影响面报告

### 改动范围
- 修改文件: ~12 个前端页面文件
- 新增文件: 1 个 EmptyState 组件

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| Dashboard | ✅ | 统计卡片样式验证 |
| 告警管理 | ✅ | 统计卡片 + 颜色标识验证 |
| 盘点管理 | ✅ | 统计卡片样式验证 |
| 操作日志 | ✅ | 统计卡片 + 响应式验证 |
| 退库管理 | ✅ | 空状态 + 按钮样式验证 |
| 调拨管理 | ✅ | 空状态 + 按钮样式验证 |
| 报废管理 | ✅ | 空状态 + 按钮样式验证 |
| 采购订单 | ✅ | 空状态 + 按钮样式验证 |
| 设备管理 | ✅ | 空状态 + 页面间距验证 |
| 入库管理 | ✅ | 页面间距验证 |
| BOM 管理 | ✅ | 按钮颜色 + 页面间距验证 |
| 物料管理 | ✅ | 按钮高度 + 页面间距验证 |

### 回滚方案
| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 4.1 统计卡片 | 恢复各页面原始样式 | 恢复样式不一致 |
| 4.2 按钮样式 | 恢复原始按钮类名 | 恢复颜色/高度不统一 |
| 4.3 空状态 | 删除 EmptyState 组件，恢复原始空状态 | 恢复"暂无数据"文案 |
| 4.4 页面间距 | 恢复 space-y-5 | 恢复间距不统一 |
| 4.5 按钮文案 | 恢复原始按钮文案 | 恢复文案不统一 |
| 4.6 加载状态 | 恢复原始加载方式 | 恢复混合加载样式 |
| 4.7 响应式 | 恢复 grid-cols-4 | 恢复移动端溢出 |
| 4.8 无障碍 | 移除 aria-label | 恢复无障碍缺陷 |

## 五、PM 黑盒验收清单

### 功能正确性
- [ ] 所有统计卡片视觉风格一致
- [ ] Alerts 预警仍有醒目视觉提示
- [ ] 所有弹窗 ESC/遮罩关闭正常
- [ ] 表单关闭后重新打开数据已重置

### 数据一致性
- [ ] 统计卡片数据准确
- [ ] 空状态不误报"暂无数据"

### 异常处理
- [ ] 窄屏下统计卡片不溢出
- [ ] 空状态图标在移动端正常显示
- [ ] Modal 关闭按钮有 aria-label 无障碍标签
