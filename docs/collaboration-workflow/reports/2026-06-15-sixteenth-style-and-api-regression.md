# 第十六批样式异常复现与 P1 API 回归报告

> 日期：2026-06-15
> 基线分支：`origin/codex/master-aligned-integration-2026-06-15`
> 验证分支：`collaboration/2026-06-15-sixteenth-style-api-regression`
> 验证提交：`6aed856`

## 一、分支与历史

- 验证分支 HEAD: `6aed856`
- master HEAD: `afe8270`
- merge base: `afe8270` ✅（存在）

## 二、后端验证

### npm ci

- 结果: ✅ 通过
- 漏洞: 9 个（6 moderate, 2 high, 1 critical）- 与之前一致，不阻断

### npm run build

- 结果: ✅ 通过

### npm test

- 结果: ✅ 通过
- 测试文件: 8 passed (8)
- 测试用例: 87 passed (87)
- 耗时: 5.14s
- **Vite close timeout: 无** ✅（干净退出）

### npm start + /api/health

- 结果: ✅ 通过
- 健康检查: `{"success":true,"data":{"status":"ok"}}`

## 三、三个 P1 API 回归

| API | 状态码 | 结果 | 说明 |
|-----|--------|------|------|
| `/api/v1/inbound/stats` | 500 | ❌ 失败 | `no such column: is_deleted` |
| `/api/v1/purchase-orders` | 500 | ❌ 失败 | `no such column: is_deleted` |
| `/api/v1/reports/cost-by-material` | 200 | ✅ 成功 | 返回空数据（正常） |

**说明**：`inbound/stats` 和 `purchase-orders` 两个 API 仍然返回 500 错误，错误信息为 `no such column: is_deleted`。这是数据库 schema 问题，表中缺少 `is_deleted` 列。

## 四、前端构建验证

### tsc 类型检查

- 结果: ✅ 通过
- 输出: 无（clean exit，零错误零警告）

### vite build

- 结果: ✅ 通过
- 耗时: 7.06s
- 模块数: 2650 modules transformed
- Chunk size warning: 有（已知可接受，不作为阻断）

## 五、样式复现专项

### 1. dev server 检查

**打开方式**: `npm run dev`，浏览器打开 `http://localhost:8080`

**CSS 状态**:
- 2 个样式表（内联样式）
- rules 数量: 91 和 16
- 无外部 CSS 文件（dev server 使用内联样式）

**页面检查**:

| 页面 | 结果 | 发现 |
|------|------|------|
| /login | ✅ 通过 | 样式正常，布局、颜色、间距、按钮样式均存在 |
| /dashboard | ✅ 通过 | 样式正常，统计卡片和图表区域可渲染 |
| /materials | ✅ 通过 | 样式正常，列表正常显示 |
| /inbound | ⚠️ 有错误 | 样式正常，但有 500 错误（inbound/stats） |
| /cost-analysis | ✅ 通过 | 样式正常，页面可进入 |

**结论**: dev server 样式**未丢失**，页面渲染正常。

### 2. preview server 检查

**打开方式**: `npm run preview -- --host 127.0.0.1 --port 4173`，浏览器打开 `http://127.0.0.1:4173`

**CSS 状态**:
- 外部 CSS 文件: `http://127.0.0.1:4173/assets/index-BMuFq823-1781503656305.css`
- CSS 文件状态码: 200 ✅
- rules 数量: 678（外部）+ 91（内联）
- 无 blocked 或 0 rules

**页面检查**:

| 页面 | 结果 | 发现 |
|------|------|------|
| /login | ✅ 通过 | 样式正常，布局、颜色、间距、按钮样式均存在 |
| /dashboard | ✅ 通过 | 样式正常，统计卡片和图表区域可渲染 |
| /materials | ✅ 通过 | 样式正常，列表正常显示 |
| /inbound | ⚠️ 有错误 | 样式正常，但有 500 错误（inbound/stats） |
| /cost-analysis | ✅ 通过 | 样式正常，页面可进入 |

**结论**: preview server 样式**未丢失**，页面渲染正常。

## 六、样式丢失复现结果

**未复现样式丢失**。

在 dev server 和 preview server 两种打开方式下，页面样式均正常显示：
- CSS 文件状态码为 200
- `cssRules.length` 不为 0 或 blocked
- 登录页和 Dashboard 存在明显布局、颜色、间距和按钮样式

## 七、阻断问题

### P0 阻断

**无**

### P1 问题（非阻断）

| 问题 | 影响 | 说明 |
|------|------|------|
| `/api/v1/inbound/stats` 返回 500 | 入库页面统计卡片无法显示 | 数据库缺少 `is_deleted` 列 |
| `/api/v1/purchase-orders` 返回 500 | 入库页面采购订单列表无法加载 | 数据库缺少 `is_deleted` 列 |

## 八、建议

**暂不建议进入 PR / 合并准备**。

原因：
1. 两个 P1 API 仍然返回 500 错误（`no such column: is_deleted`）
2. 需要修复数据库 schema，添加 `is_deleted` 列
3. 修复后需要重新验证

**建议后续处理**：
1. 主设备修复后端数据库 schema，为相关表添加 `is_deleted` 列
2. 重新运行 npm test 验证
3. 重新验证三个 P1 API
4. 确认样式仍然正常
5. 然后进入 PR / 合并准备

---

*验证时间: 2026-06-15*
*验证者: 第二台设备*
