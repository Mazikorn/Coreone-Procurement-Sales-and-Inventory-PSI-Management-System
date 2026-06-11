# 2026-06-05 E2E 选择器修复 + 对抗性审查

## 工作内容

### Phase 1: UI 组件添加 data-testid（并行 codex 代理）

**SearchableSelect.tsx** — 核心组件改造：
- 新增 `testId?: string` prop
- 容器 div 添加 `data-testid={testId}`
- 下拉选项 li 添加 `data-testid={option-${opt.value}}`

**InboundFormModal.tsx** — 14 个标识符：
- 6 个 SearchableSelect: inbound-type-select, purchase-order-select, from-location-select, material-select, location-select, supplier-select
- 8 个 input/textarea/button: batch-no-input, quantity-input, price-input, production-date-input, expiry-date-input, remark-input, submit-btn, cancel-btn

**OutboundFormModal.tsx** — 10 个标识符：
- 4 个 SearchableSelect: outbound-type-select, project-select, bom-select, material-select-${idx}
- 6 个 input/textarea/button: sample-count-input, quantity-input-${idx}, remark-input, submit-btn, cancel-btn, add-item-btn

**StocktakingCreateModal.tsx** — 9 个标识符：
- 3 个 SearchableSelect: stocktaking-type-select, stocktaking-scope-select, material-select
- 6 个 input/textarea/button: stocktaking-name-input, actual-stock-input, manager-input, remark-input, cancel-btn, next-step-btn

### Phase 1: E2E 测试选择器修复（并行 codex 代理）

**新建** `e2e/scenarios/shared/searchable-select.ts`：
- `selectSearchableOption(page, testId, optionLabel)` — 按标签选择选项
- `selectFirstSearchableOption(page, testId)` — 选择第一个选项

**4 个核心测试文件修复**（131 处选择器替换）：
- `purchase-inbound.spec.ts` — material/supplier/location/select → SearchableSelect helper
- `direct-inbound.spec.ts` — material/location/select → SearchableSelect helper
- `stocktaking.spec.ts` — material/select → SearchableSelect helper
- `project-outbound.spec.ts` — project/bom/select + button text "出库登记"

**Pattern 2 修复**：出库按钮 "新增出库" → "出库登记"
**Pattern 5 修复**：`firstRow.click()` → `detailBtn.click()`（11 处）
**Pattern 6 修复**：无 "待审批" 文本需修改

### Phase 2: 对抗性代码审查

**CRITICAL 发现（已全部修复）**：
1. StocktakingCreateModal 缺少 material-select 和 actual-stock-input → 已添加
2. searchable-select.ts 的 `li:has-text()` 未限定在 dropdown 容器内 → 已修复
3. `option-*` 选择器未限定在容器内 → 已修复
4. `waitForTimeout(300)` 竞态条件 → 改用 `dropdown.waitFor({ state: 'visible' })`

**WARNING 发现（待处理）**：
- 8 个非核心测试文件仍有旧 `select[name=...]` 选择器
- `li:has-text()` 子串匹配风险

### 测试验证

direct-inbound.spec.ts：17 通过 / 6 失败
- 失败主因：登录超时（page.waitForURL 15s）= 服务器响应慢，非选择器问题
- TypeScript 编译：✅ 通过

## 修改文件清单

### UI 组件（src/）
- `components/ui/SearchableSelect.tsx` — testId prop + data-testid
- `pages/inbound/components/InboundFormModal.tsx` — 14 个 data-testid
- `pages/outbound/components/OutboundFormModal.tsx` — 10 个 data-testid
- `pages/inventory/components/StocktakingCreateModal.tsx` — 9 个 data-testid + 物料/实盘字段

### E2E 测试（e2e/）
- `scenarios/shared/searchable-select.ts` — 新建 helper
- `scenarios/warehouse-manager-suite/purchase-inbound.spec.ts` — 选择器修复
- `scenarios/warehouse-manager-suite/direct-inbound.spec.ts` — 选择器修复
- `scenarios/warehouse-manager-suite/stocktaking.spec.ts` — 选择器修复
- `scenarios/technician-suite/project-outbound.spec.ts` — 选择器+按钮文本修复

## 建议下一步

1. 运行全量 E2E 测试验证修复效果
2. 修复剩余 8 个非核心测试文件的选择器
3. 执行 Plan 7（性能优化）
