# 财务配置 ABC 作业中心、成本池和收费映射 用户故事运行记录

## 故事边界

- 故事: 作为财务，我要配置 ABC 作业中心、成本池和收费映射，以便成本核算有可解释的分摊和收入口径
- 角色: 财务
- 用户目标: 成本配置可维护并保护关账事实
- 涉及页面: `/abc/activity-centers`, `/abc/cost-pools`, `/abc/fee-mappings`, `/bom`, `/projects`
- 涉及后端/API/数据表: `/api/v1/abc/activity-centers`, `/api/v1/abc/cost-pools`, `/api/v1/abc/bom-fee-mappings`, `/api/v1/boms`, `/api/v1/projects`, `/api/v1/materials`; `abc_activity_centers`, `abc_cost_drivers`, `abc_cost_pools`, `bom_fee_mappings`, `fee_standards`, `boms`, `projects`, `materials`, `abc_audit_logs`
- 上游输入: 项目、BOM、物料、设备、工时、收费标准
- 下游交接: 成本核算、利润分析、月结审计
- 明确不做: 不处理消耗对账、成本重算、关账、利润趋势展示；若配置缺陷会导致后续核算不可解释、关账事实被污染或收费映射失真，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: `前端代码/src/lib/permissions.ts`, `前端代码/src/App.tsx`, `前端代码/src/components/layout/AppSidebar.tsx`
- 前端页面/组件/hook: `FeeMappingConfig.tsx`, `ActivityCenterList.tsx`, `CostPoolList.tsx`, `Projects.tsx`, `BOMList.tsx`
- 后端路由/权限/副作用: `rolePermissions.ts`, `abc-v1.1.ts`, `projects-v1.1.ts`, `bom-v1.1.ts`, `materials.ts`
- 数据表/审计日志: `fee_standards`, `bom_fee_mappings`, `abc_activity_centers`, `abc_cost_pools`, `abc_audit_logs`
- 测试: `role-story-009-finance-abc-configuration.test.ts`, `abc-cost.test.ts`, `permissions.test.ts`, `App.routes.test.ts`, `useProjectsPage.test.ts`, `useBOMPage.test.ts`
- Playwright 前置规则: 已重读 `AGENTS.md` Playwright 强规则和两条记忆文件；已验证本地 Chromium 1217 / Chrome for Testing 147.0.7727.15，未执行任何浏览器下载。
- 库存/BOM/出库/成本/预警/审计影响: 本故事不改变库存或出库事实，但财务配置会成为后续成本核算、利润分析和关账解释的前置口径，必须可回看、可审计、可兼容历史收费标准状态。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 财务负责 ABC 配置和收费映射，技术负责项目/BOM 建模 | 财务需要只读项目/BOM/物料上下文，但不应改技术主数据 | 缺少上下文会迫使财务线下问技术或越权找管理员 | 已给 finance 补项目/BOM/物料后端只读，前端补 `/projects`、`/bom` 入口，写权限继续拒绝 |
| 用户目标是否完整 | 可配置作业中心、成本池、收费映射 | 成本池手工录入不是当前页面主路径，当前页面强调来源同步/自动归集/重算 | 手工调整成本池属于月结/重算治理，放到故事 010 继续复核 | 本故事验证财务可创建配置、页面可回看；手工调整 UX 记录为相邻线索 |
| 信息字段是否够用 | 作业中心有代码/名称/动因，成本池有期间/直接/间接/动因量，收费映射有 BOM、收费标准、聚合方式 | 主字段足以支撑高频配置；收费标准历史状态存在 `1` 和 `active` 混用 | 若只认 `active`，旧库启用收费标准无法映射，后续成本/收入失真 | 已统一收费标准启用判断兼容 `active`、`1`、数字 `1` |
| 交接关系是否正确 | 技术交付项目/BOM，财务做收费和成本口径 | 原先 finance 看不到项目/BOM 页面，交接断裂 | 财务无法判断收费映射对应哪个 BOM | 已补财务只读回看并验证 |
| 状态流转是否合理 | 收费映射保存后从未映射变为已配置 | 旧状态兼容是事实链核心，不是边界问题 | 页面/API 能用但旧数据被判停用会直接阻断主流程 | 已修复并补回归 |
| 用户工作量是否合理 | 财务可在同一页面检索 BOM 并配置收费标准 | 基本合理；隐藏成本池页面仍需通过 URL 进入 | 隐藏入口不阻断高频配置，但需在后续产品导航治理中确认 | 记录为 P3/相邻线索 |
| 是否支撑成本/审计 | fee mapping 原有审计，作业中心/成本池缺少审计 | ABC 配置写操作必须追责 | 缺审计会影响关账解释和责任追踪 | 已补作业中心、成本动因、成本池写审计 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS009-01 | 权限/交接 | 财务配置 ABC 时需要项目/BOM/物料上下文，但 finance 前端无 `/projects`、`/bom`，后端无 `projects:view`、`bom:view`、`materials:view` | 现场复核 `ROLE_MENU_MAP.finance` 和 `ROLE_PERMISSIONS.finance` | 技术建模 -> 财务收费映射交接断裂 | P1 | 补 finance 项目/BOM 前端入口和项目/BOM/物料后端只读；写技术主数据仍 403 | 单测、API 权限、Playwright 财务页面回看和写拒绝 | completed |
| RS009-02 | 审计 | 财务创建/更新/删除作业中心、成本动因、成本池时未写 `abc_audit_logs` | 现场复核 `abc-v1.1.ts`，fee mapping 有审计而上述配置缺失 | 财务配置 -> 月结解释 -> 审计追责断裂 | P1 | 补 activity_center、cost_driver、cost_pool 写审计 | 后端回归、Playwright 后数据库审计回看 | completed |
| RS009-03 | 数据兼容/事实链 | 现场 dev 库 `fee_standards.status` 为 INTEGER 且启用值为 `1`，接口只按 `status = 'active'` 判断，财务保存收费映射会报“收费标准不存在或已停用” | Playwright 准备数据与 API 保存失败；`PRAGMA table_info(fee_standards)` 显示 `status:INTEGER default=1` | BOM 收费映射 -> 成本核算收入口径 -> 利润分析失真 | P1 | 增加 `activeStatusSql`，收费映射校验和映射审计 join 兼容 `active`、`1`、数字 `1` | 后端新增回归、Playwright 保存映射、API/DB 回看 | completed |
| RS009-04 | 产品/导航 | 成本池页面是隐藏 URL 入口，且页面主动作是同步/自动归集/重算，未提供显式手工新建表单 | 页面现场走查 | 低频手工调整/关账治理可能需要更清晰入口 | P3 | 不阻断当前故事；转入 010 月结/重算/关账复核线索 | 010 继续确认 | open |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS009-01 | `rolePermissions.ts` | finance 增加 `projects:view`, `bom:view`, `materials:view` |
| RS009-01 | `permissions.ts`, `permissions.test.ts` | finance 菜单增加 `/projects`, `/bom`，并补前端权限单测 |
| RS009-02 | `abc-v1.1.ts` | activity_center、cost_driver、cost_pool create/update/delete 或 upsert 写入 `abc_audit_logs` |
| RS009-03 | `abc-v1.1.ts` | 新增 `activeStatusSql`，收费标准校验和 BOM 收费映射审计 join 兼容历史启用状态 |
| RS009-03 | `role-story-009-finance-abc-configuration.test.ts` | 新增 finance 在 legacy `status = 1` 收费标准下保存 BOM 收费映射并审计的回归 |
| 文档同步 | `docs/05_Role_Permission_Matrix.md` | 同步 finance 项目/BOM/物料只读、ABC 写审计和权限事实 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端回归 | `npm run test -- tests/role-story-009-finance-abc-configuration.test.ts tests/integration/abc-cost.test.ts` | 2 files / 23 tests passed；Vitest close timeout 提示但 exit code 0 | finance 只读上下文、技术主数据写拒绝、ABC 配置写入和审计、legacy `fee_standards.status=1` 收费映射通过 |
| 前端权限/页面回归 | `npm run test -- src/lib/permissions.test.ts src/App.routes.test.ts src/pages/master/hooks/useProjectsPage.test.ts src/pages/bom/hooks/useBOMPage.test.ts` | 5 files / 37 tests passed | finance `/projects`、`/bom` 入口和技术主数据只读测试通过 |
| 后端构建 | `npm run build` in `后端代码/server` | passed | TypeScript 编译通过 |
| 前端构建 | `npm run build` in `前端代码` | passed，只有 chunk size warning | Vite 构建通过 |
| Playwright 前置 | 读 AGENTS + 两条 Playwright 记忆；`find`, `test -x`, `--version`, real launch | Chrome for Testing 147.0.7727.15；title `chromium-path-ok`；未下载浏览器 | 本地 Chromium 1217 可用 |
| 财务只读上下文 | 财务 `sunli` 打开 `/projects`, `/bom`，检索 `rs009-1781953562730` 测试数据 | 页面可见项目/BOM；无“新建服务”“新建BOM”；API POST `/projects`、`/boms` 均 403 | `docs/role-story-runs/screenshots/009/rs009-1781953562730-projects-readonly.png`, `...-bom-readonly.png` |
| 作业中心配置 | 财务在 `/abc/activity-centers` 新增 `财务009作业中心-rs009-1781953562730` | 页面回看成功；DB 审计 `module=activity_center action=create operator=sunli` | `...-activity-center-created.png` |
| 成本池配置回看 | 财务创建 2098-09 成本池并在 `/abc/cost-pools` 按期间/作业中心回看 | 页面显示 `009财务成本池-rs009-1781953562730`；DB 审计 `cost_pool create sunli` | `...-cost-pool-readback.png` |
| 收费映射弹窗 | 财务在 `/abc/fee-mappings` 打开 BOM 配置弹窗，选择 `status=1` 的收费标准并预览 | 预览显示收费金额和收费标准 | `...-fee-mapping-preview.png` |
| 收费映射保存回看 | 保存 BOM 收费映射后刷新页面/API/DB | 页面行显示“已配置”和 1 项映射；API `/bom-fee-mappings/:bomId` 返回 1 条；DB `bom_fee_mapping update sunli` | `...-fee-mapping-saved.png` |

## 故事收口报告

- P0/P1 是否清零: 是。RS009-01/02/03 已修复并验证。
- 影响角色交接或事实链的 P2 是否清零: 是。财务可只读接收技术项目/BOM/物料上下文，ABC 写审计补齐，历史收费标准启用状态已兼容。
- 角色职责/权限边界是否合理: 是。财务能写财务配置，不能写技术主数据；技术/财务职责边界清楚。
- 页面/弹窗验证: 已覆盖 `/projects`, `/bom`, `/abc/activity-centers`, `/abc/cost-pools`, `/abc/fee-mappings` 和收费映射弹窗。
- 前后端权限一致性验证: 已覆盖 finance 前端只读按钮隐藏、后端技术主数据写拒绝、ABC 配置写允许。
- 后端/API/数据库验证: 已覆盖配置写入、数据回看、`abc_audit_logs`。
- 数据回看验证: 已覆盖项目/BOM 页面、成本池页面、收费映射页面、API 和 DB。
- 库存/BOM/出库/成本/预警/审计影响: 不改变库存/出库；BOM 收费映射、成本池和审计链已验证；为 010 成本核算/关账提供前置口径。
- 未处理 P3: RS009-04 成本池隐藏入口和手工调整 UX，转入 010/后续产品导航治理。
- 相邻故事线索: 010 需要继续确认消耗对账、成本核算、重算、关账是否会阻止未配置/异常数据进入月结；同时确认成本池手工调整或自动归集入口是否足够。
- 当前 git 状态: 工作区仍包含 001-009 多故事修改和验证产物，未做提交/清理。
