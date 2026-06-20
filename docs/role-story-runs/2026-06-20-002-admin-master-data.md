# 系统管理员建立基础资料 用户故事收口记录

## 故事边界

- 故事: 作为管理员，我要建立分类、物料、库位、检测项目、BOM、设备和标准工时，以便后续采购、库存、出库和成本有统一口径
- 角色: 系统管理员
- 用户目标: 主数据可维护且引用关系正确
- 涉及页面: `/categories`, `/materials`, `/locations`, `/projects`, `/bom`, `/equipment`, `/labor-times`
- 涉及后端/API/数据表: `categories`, `materials`, `locations`, `projects`, `boms`, `equipment`, `equipment-types`, `labor-times`, `operation_logs`, `standard_labor_times`
- 上游输入: 业务分类和实验室管理口径
- 下游交接: 采购、仓储、技术、财务
- 明确不做: 不处理采购入库、仓储出库和 ABC 成本核算主流程；基础资料问题如果影响这些事实链，只修当前故事必须闭环的问题。

## 当前检索记录

- 角色菜单/路由: `AppSidebar.tsx`, `permissions.ts`, `docs/05_Role_Permission_Matrix.md`
- 前端页面/组件/hook: 分类、物料、库位、项目、BOM、设备、标准工时页面及标准工时弹窗/确认弹窗
- 后端路由/权限/副作用: `categories-v1.1.ts`, `materials.ts`, `locations-v1.1.ts`, `projects-v1.1.ts`, `bom-v1.1.ts`, `equipment-v1.1.ts`, `equipment-types-v1.1.ts`, `labor-time-v1.1.ts`, `app.ts`
- 数据表/审计日志: `material_categories`, `materials`, `locations`, `projects`, `boms`, `bom_items`, `equipment`, `standard_labor_times`, `operation_logs`
- 测试: `labor-time.test.ts`, `master-data-audit.test.ts`, BOM/设备/项目/库位/物料/ABC/报表相关回归
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, `docs/02_PRD.md`, `docs/04_Business_Rules.md`, 001 运行记录相邻线索
- 库存/BOM/出库/成本/预警/审计影响: 当前故事定义采购、库存、BOM、设备工时和成本输入口径，直接影响后续事实链是否可解释、可重算、可审计。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 管理员可维护基础资料；技术员/财务在后续故事也有部分建模或成本参数职责 | 当前矩阵可解释；本故事不收窄技术/财务职责 | 后续 007/009 需继续质疑职责边界 | 002 保持管理员主路径验证 |
| 用户目标是否完整 | 分类、物料、库位、项目、BOM、设备、工时均有页面和 API | 标准工时原删除语义不完整 | 成本输入可能被不可追溯地移除 | 已修复为归档 |
| 信息字段是否够用 | 基础资料字段可支撑主流程创建和回看 | 未发现阻断高频主流程的字段缺失 | 低频归档/清理策略需产品再定 | 记录 P3 |
| 交接关系是否正确 | 基础资料向采购、仓储、技术、财务交接 | 主数据写操作原缺少统一日志 | 审计交接断裂 | 已补日志 |
| 状态流转是否合理 | 多数主数据有状态/引用保护 | 标准工时物理删除破坏历史事实；主数据删除保护偏保守 | 前者影响成本，后者影响清理体验 | 前者修复，后者 P3 |
| 用户工作量是否合理 | 管理员可在各页面维护和回看 | 主流程可完成 | 暂无 P0/P1 | 保持 |
| 是否支撑成本/审计 | BOM、设备、工时进入成本输入 | 工时删除和主数据日志缺失会削弱可审计、可重算 | 影响 BOM/ABC/报表事实链 | 已修复并验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-002-01 | 成本/审计事实链 | 标准工时删除为物理删除，且创建/更新/删除无操作日志 | `DELETE FROM standard_labor_times`；成本计算、ABC、报表读取该表 | 标准工时 -> BOM 成本预览 -> ABC/报表成本；删除后历史口径不可追溯 | P2 | 改为 `is_deleted` 归档，列表/详情/成本读取过滤归档数据，写入操作日志，前端文案改为归档 | RED/绿灯 `labor-time.test.ts`；真实页面弹窗创建/归档、详情 404、日志回看、成本预览回落 | completed |
| RS-002-02 | 审计/交接 | 分类、物料、库位、项目、BOM、设备成功写操作未进入 `operation_logs` | 现场检索仅用户、角色、工时等少数模块有日志；基础资料路由无统一日志 | 管理员基础资料 -> 采购/仓储/技术/财务；后续角色看到的数据缺少来源追责 | P2 | 增加基础资料成功写操作审计中间件，覆盖分类、物料、库位、项目、BOM、设备、设备类型 | RED/绿灯 `master-data-audit.test.ts`；真实浏览器创建后 `/logs` API 按唯一审计组回看 | completed |
| RS-002-P3-01 | 删除/归档产品策略 | BOM/项目/物料存在历史引用后，测试清理时 API 删除被保守引用保护阻断 | 真实验证中 API 清理尝试后仍需精确数据库清理测试数据 | 不阻断管理员建立基础资料；影响低频清理/归档体验 | P3 | 记录给后续产品策略，不在 002 扩大修复 | 后续故事若涉及主数据归档/清理再评估 | recorded |
| RS-002-P3-02 | 设备资产生命周期 | 设备无引用时仍是硬删除语义 | 现有测试和路由保持硬删除 | 不阻断 002；后续 007 技术建模和资产折旧可能需要归档语义 | P3 | 记录相邻线索 | 007/009 继续质疑 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-002-01 | `后端代码/server/src/database/DatabaseManager.ts` | `standard_labor_times` 增加 `is_deleted` 字段和迁移兜底 |
| RS-002-01 | `后端代码/server/src/routes/labor-time-v1.1.ts` | 列表、统计、项目类型、详情过滤归档数据；删除改为归档；创建/更新/归档写操作日志 |
| RS-002-01 | `后端代码/server/src/utils/cost-calculator.ts`, `abc-v1.1.ts`, `reports-v1.1.ts` | 成本计算、ABC 来源汇总、报表成本预加载均排除归档工时 |
| RS-002-01 | `前端代码/src/pages/labor/LaborTimeList.tsx`, `useLaborTimePage.ts` | 删除确认文案和 toast 改为归档语义，并明确归档后不参与成本和列表展示、历史仍可审计 |
| RS-002-01 | `后端代码/server/tests/labor-time.test.ts` | 覆盖软归档、详情 404、列表排除、操作日志、归档工时不参与成本 |
| RS-002-02 | `后端代码/server/src/app.ts` | 增加基础资料成功写操作统一审计中间件和路径归一化 |
| RS-002-02 | `后端代码/server/tests/master-data-audit.test.ts` | 覆盖管理员创建分类、库位、物料、项目、设备、BOM 后的操作日志 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 标准工时 RED/回归 | `npm run test -- tests/labor-time.test.ts` | 9/9 通过 | 覆盖归档、日志、成本过滤 |
| 基础资料审计 RED/回归 | `npm run test -- tests/master-data-audit.test.ts` | 1/1 通过 | 覆盖六类主数据写日志 |
| 002 targeted 后端回归 | `npm run test -- tests/master-data-audit.test.ts tests/labor-time.test.ts` | 10/10 通过 | 审计路径修正后复跑通过 |
| 后端构建 | `npm run build` | 通过 | TypeScript 编译通过 |
| 前端构建 | `npm run build` | 通过 | 仅保留既有 Vite chunk warning |
| 前端标准工时单测 | `npm run test -- src/pages/labor/hooks/useLaborTimePage.test.ts src/pages/labor/components/LaborTimeFormModal.test.tsx src/pages/labor/components/LaborTimeDetailModal.test.tsx` | 5/5 通过 | 管理权限、编辑只读字段、弹窗展示 |
| 相关后端事实链回归 | `npm run test -- tests/labor-time.test.ts tests/master-data-audit.test.ts tests/bom-batch.test.ts tests/equipment.test.ts tests/projects-batch.test.ts tests/locations-guard.test.ts tests/materials-guard.test.ts tests/integration/bom.test.ts tests/integration/abc-cost.test.ts tests/integration/reports-cost-by-material.test.ts` | 10 files / 139 tests 通过 | BOM、设备、项目、库位、物料、ABC、报表未回归 |
| Playwright 使用前规则 | 读取 `AGENTS.md` 指定两条记忆文件；`find ~/Library/Caches/ms-playwright`、`test -x`、`--version`、真实 launch | 通过 | Chromium 1217 / Chrome for Testing 147.0.7727.15；未运行 `npx playwright install` |
| 真实页面闭环 | 管理员浏览 `/categories`, `/materials`, `/locations`, `/projects`, `/bom`, `/equipment`, `/labor-times`；API 创建基础资料；页面回看；日志回看；标准工时弹窗创建/归档；详情 404；BOM 成本预览 | 通过 | 输出 `ok: true`；成本 `384.09 -> 447.09 -> 384.09` |
| 验证数据清理 | API 清理尝试后，对本轮 `浏览器分类-*` / `浏览器物料-*` / `浏览器库位-*` / `浏览器项目-*` / `浏览器BOM-*` / `浏览器设备-*` / `LAB-BROWSER-*` 精确数据库清理 | 通过 | 本轮精确前缀无残留；旧 `预警浏览器物料-*` 属历史数据，不纳入 002 |

## 故事收口报告

- P0/P1 是否清零: 是，本故事未发现阻断管理员建立基础资料的 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是，RS-002-01 和 RS-002-02 均已修复并验证。
- 角色职责/权限边界是否合理: 当前角色矩阵允许管理员维护基础资料，技术员/财务部分职责留待 007/009 继续质疑；本故事不做越界调整。
- 页面/弹窗验证: 七个页面真实打开；标准工时新增和归档弹窗真实操作通过。
- 前后端权限一致性验证: 管理员页面可见且 API 可写；标准工时维护权限回归覆盖 admin/finance/technician/pathologist/warehouse_manager 差异。
- 后端/API/数据库验证: 标准工时归档副作用、详情 404、操作日志、成本过滤、基础资料写日志均通过。
- 数据回看验证: 分类、物料、库位、项目、BOM、设备创建后页面回看通过；操作日志按唯一审计组回看通过。
- 库存/BOM/出库/成本/预警/审计影响: BOM 成本预览在工时创建后上升、归档后回落；归档工时不再进入 ABC/报表成本来源；主数据写入可审计。
- 未处理 P3: 主数据历史引用后的清理/归档策略、设备资产硬删除语义。
- 相邻故事线索: 003 采购故事需继续检查供应商/采购订单写操作是否可审计；007/009 继续检查技术员/财务对项目、BOM、设备、标准工时职责是否过宽或不足。
- 当前 git 状态: 工作区包含 001/002 已完成修改和 003 启动记录；未提交。
