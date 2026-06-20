# 技术员维护检测项目、BOM、设备和标准工时 用户故事运行记录

## 故事边界

- 故事: 作为技术员，我要维护检测项目、BOM、设备和标准工时，以便实验操作口径能被出库和成本核算使用
- 角色: 技术员
- 用户目标: 技术资料能表达真实实验操作
- 涉及页面: `/projects`, `/bom`, `/equipment`, `/labor-times`, `/inventory`
- 涉及后端/API/数据表: `/api/v1/projects`, `/api/v1/boms`, `/api/v1/equipment`, `/api/v1/labor-times`, `/api/v1/inventory`; `projects`, `boms`, `bom_items`, `equipment`, `equipment_types`, `labor_times`, `inventory`, `operation_logs`
- 上游输入: 管理员基础分类、物料、设备
- 下游交接: 仓管出库、财务成本
- 明确不做: 不处理财务 ABC 配置、消耗对账和成本关账；若项目/BOM/设备/工时会影响仓管出库、成本快照、重算或审计事实链，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: 复核 `前端代码/src/lib/permissions.ts`, `前端代码/src/App.tsx`, `AppSidebar` 路由行为；技术员应进入 `/projects`, `/bom`, `/equipment`, `/labor-times`，医生可读技术模型，仓管仅需后端只读项目/BOM 供出库选择。
- 前端页面/组件/hook: 复核并调整 `useProjectsPage`, `useBOMPage`, `useEquipmentPage`, `useEquipmentTypePage`, `useLaborTimePage` 的可写判断；补充项目/BOM/设备/工时 hook 和路由权限测试。
- 后端路由/权限/副作用: 复核 `rolePermissions.ts`, `DatabaseManager.ts`, `projects-v1.1.ts`, `bom-v1.1.ts`, `equipment-v1.1.ts`, `labor-time-v1.1.ts`, `auth.ts`; 写入接口依赖模块权限，审计日志由主数据审计中间件和工时路由记录。
- 数据表/审计日志: 复核 `roles.permissions`, `projects`, `boms`, `bom_items`, `equipment`, `standard_labor_times`, `operation_logs`; Playwright 数据 `rs007-1781951830658` 可在 API、页面和日志回看。
- 测试: 新增/调整 `role-story-007-modeling-permissions.test.ts`, `labor-time.test.ts`, `App.routes.test.ts`, `permissions.test.ts`, `useProjectsPage.test.ts`, `useBOMPage.test.ts`, `useEquipmentPage.test.ts`, `useEquipmentTypePage.test.ts`, `useLaborTimePage.test.ts`。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, 002 运行记录, 006 相邻线索。
- 库存/BOM/出库/成本/预警/审计影响: 项目/BOM/设备/标准工时是仓管 BOM 出库和财务成本核算的基础事实；本故事已验证 BOM 成本预览材料价、技术模型写操作日志、医生/仓管越权写入拒绝。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 技术员需要维护项目/BOM/设备/工时；医生需要查看模型和成本趋势；仓管只需在出库中引用项目/BOM | 原设计让医生/仓管拥有过宽写权限，同时技术员不能维护标准工时，职责错位 | 技术模型可能被非责任角色改写，或技术员只能线下维护工时 | 收敛医生/仓管为只读或菜单不可达，放开技术员工时写权限 |
| 权限边界是否合理 | 前端菜单和页面 hook 各自判断，后端角色权限表另行判断 | 原设计存在前端隐藏但后端可写、前端可见但后端拒绝的风险 | 越权写入或故事中断 | 统一默认角色权限、数据库迁移、路由守卫和页面按钮逻辑 |
| 信息字段是否够用 | 项目可绑定 BOM，BOM 可记录核心物料，设备有折旧字段，工时有类型/费率/来源 | 高频建模字段能支撑本故事；更细的 BOM 版本治理留到后续成本/全链路继续观察 | 当前故事不阻断 | 本故事验证核心字段写入、成本预览和页面回看 |
| 状态/版本流转是否合理 | 项目/BOM/设备有启停/删除保护，工时归档在 002 已处理 | 当前主流程可用；BOM 版本细颗粒治理不是 007 阻断项 | 后续成本关账可能需要更强版本冻结 | 作为相邻线索，不在 007 展开 |
| 交接关系是否正确 | 技术员产出的项目/BOM 会给仓管出库选择，工时/设备会给成本核算使用 | 仓管需要只读选择，但不能维护技术模型；医生可读但不能改 | 交接边界不清会造成出库口径和成本口径漂移 | 后端保留仓管项目/BOM GET，拒绝 POST；前端仓管直达技术页重定向 |
| 用户工作量是否合理 | 技术员可以在四个页面维护模型 | 修复后不需要线下让管理员代录标准工时，也不需要医生/仓管承担模型维护 | 降低长期手工修正 | 验证技术员真实页面可回看四类模型 |
| 是否支撑库存/成本/审计 | BOM 成本预览、工时成本、设备折旧和操作日志共同支撑后续成本链 | 修复后模型写入可审计，BOM 材料成本可预览，医生/仓管越权写入被拒绝 | 支撑出库、成本核算和责任追溯 | 后端集成测试、Playwright API/页面/日志闭环验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-007-01 | 权限/职责 | 技术员只有 `labor_times:view`，无法维护标准工时 | `rolePermissions.ts` 默认权限；`labor-time.test.ts` 原断言技术员创建 403 | 技术员不能完成实验工时建模，人工成本口径依赖线下或管理员代录 | P1 | 技术员默认权限改为 `labor_times`，数据库启动迁移同步旧角色，前端工时页面允许技术员写入 | 后端工时测试、角色故事权限测试、Playwright 技术员工时页面回看 | fixed/verified |
| RS-007-02 | 权限/职责 | 医生和仓管拥有过宽技术模型写权限 | `pathologist` 原有 `projects/bom/equipment`，`warehouse_manager` 原有 `projects`；页面 hook 也把医生/仓管视作可写 | 非模型责任角色可改项目/BOM/设备，导致出库和成本口径漂移 | P1 | 医生改为项目/BOM/设备/工时只读；仓管项目/BOM 后端只读；前端写按钮同步收敛 | 新增后端角色故事权限测试，Playwright 医生只读、仓管直达重定向/API POST 403 | fixed/verified |
| RS-007-03 | 前后端一致性 | 技术建模路由缺少统一角色路由守卫，直达 URL 可能绕过菜单 | `App.tsx` 原 `/projects`, `/bom`, `/equipment`, `/labor-times` 未用 `RoleRoute` | 菜单隐藏不足以证明角色边界，仓管/非授权角色可进入页面 | P1 | 将技术建模路由接入 `RoleRoute`，覆盖设备子路由和标准工时 | `App.routes.test.ts`，Playwright 仓管 `/projects` 重定向到 `/` | fixed/verified |
| RS-007-04 | 审计/成本支撑 | 技术模型写入必须能回看审计并支撑成本预览 | 现场脚本创建 `rs007-1781951830658` 项目/BOM/设备/工时后回看 `operation_logs` 和 BOM cost preview | 无审计会影响责任追溯；材料/工时/设备模型若不能被成本读取会影响财务故事 | P2 | 保留并验证主数据审计中间件与工时日志；验证 BOM 成本预览材料金额为 12 | API 数据回看、日志回看、Playwright 页面截图 | verified |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-007-01 | `rolePermissions.ts`, `DatabaseManager.ts`, `useLaborTimePage.ts`, `labor-time.test.ts` | 技术员默认获得标准工时写权限；启动时迁移旧权限；前端新增/编辑/归档按钮对技术员开放；测试覆盖创建/更新/归档 |
| RS-007-02 | `rolePermissions.ts`, `DatabaseManager.ts`, `useProjectsPage.ts`, `useBOMPage.ts`, `useEquipmentPage.ts`, `useEquipmentTypePage.ts`, `role-story-007-modeling-permissions.test.ts` | 医生变为技术模型只读，仓管保留项目/BOM 后端只读供出库引用；页面写按钮与后端权限一致 |
| RS-007-03 | `App.tsx`, `App.routes.test.ts`, `permissions.test.ts` | 技术建模页面和设备子路由接入角色路由守卫；补齐技术员/医生菜单和无出库权限断言 |
| RS-007-04 | `app.ts`, `projects-v1.1.ts` 注释修正；既有审计中间件/工时日志验证 | 主数据写入日志记录操作、请求体和状态码，工时日志记录实体 id；注释更新为当前权限模型 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 故事切换 | 更新 `docs/role-story-list-2026-06-20.md` | 007 标记为 `in_progress` | 006 已 completed，007 运行记录已创建 |
| 后端角色权限回归 | `npm run test -- tests/role-story-007-modeling-permissions.test.ts tests/labor-time.test.ts tests/projects-batch.test.ts tests/equipment-guard.test.ts tests/integration/bom.test.ts` | 5 files / 61 tests passed | 技术员可写项目/BOM/设备/工时；医生只读并 POST 403；仓管 GET 项目/BOM、POST 项目 403；模型写入日志存在 |
| 后端构建 | `npm run build` | passed | TypeScript 构建通过 |
| 前端权限/路由/页面 hook | `npm run test -- src/App.routes.test.ts src/lib/permissions.test.ts src/pages/master/hooks/useProjectsPage.test.ts src/pages/bom/hooks/useBOMPage.test.ts src/pages/equipment/hooks/useEquipmentPage.test.ts src/pages/equipment/hooks/useEquipmentTypePage.test.ts src/pages/labor/hooks/useLaborTimePage.test.ts` | 8 files / 44 tests passed | 技术建模路由守卫、角色菜单、写按钮逻辑通过 |
| 前端构建 | `npm run build` | passed | Vite build 通过，仅保留 chunk size warning |
| Playwright 前置规则 | 读取 `AGENTS.md` Playwright 强规则和两条记忆文件；`find ~/Library/Caches/ms-playwright`; `test -x`; `--version`; 真实 launch | passed | Chrome for Testing `147.0.7727.15`; launch title `chromium-path-ok`; 未运行 `npx playwright install` |
| 真实故事 API/副作用 | Playwright 脚本以 `admin/zhangwei/liuyf/wangkq` 调用 API，数据后缀 `rs007-1781951830658` | passed | 技术员创建项目 `cb8663b5-f57e-4bc8-8323-a865603de93c`、BOM、设备、工时；API 列表回看；BOM 成本预览材料金额 12；医生 POST 项目/BOM/设备/工时 403；仓管 POST 项目 403、GET 项目成功；日志包含 `POST /projects`, `POST /boms`, `POST /equipment`, `POST /labor-times` |
| 真实页面回看 | Playwright 登录技术员、医生、仓管并截图 | passed | `docs/role-story-runs/screenshots/007/technician-projects.png`, `technician-bom.png`, `technician-equipment.png`, `technician-labor-times.png`, `doctor-projects-readonly.png`, `doctor-bom-readonly.png`, `warehouse-projects-redirect.png` |

## 故事收口报告

- P0/P1 是否清零: 已清零；RS-007-01/02/03 均 fixed/verified。
- 影响角色交接或事实链的 P2 是否清零: 已清零；RS-007-04 已用成本预览、API 回看和操作日志验证。
- 角色职责/权限边界是否合理: 当前故事内合理；技术员可维护模型，医生只读，仓管前端不能进入技术建模页但后端可只读项目/BOM 供出库引用。
- 页面/弹窗验证: 已覆盖技术员项目/BOM/设备/工时页面、医生项目/BOM只读页面、仓管直达项目页重定向；截图保存于 `docs/role-story-runs/screenshots/007/`。
- 前后端权限一致性验证: 已覆盖前端路由/菜单/按钮测试和后端 API 403/200；医生、仓管越权写入均拒绝。
- 后端/API/数据库验证: 已覆盖技术模型创建、列表回看、BOM cost preview、角色权限、数据库日志。
- 数据回看验证: 技术员创建的 `rs007-1781951830658` 项目/BOM/设备/工时均可在 API 和真实页面回看。
- 库存/BOM/出库/成本/预警/审计影响: 项目/BOM 可交给仓管出库引用；BOM 材料成本可被成本预览读取；工时可进入人工成本；设备折旧字段可维护；模型写入有审计日志。007 未直接改库存/预警。
- 未处理 P3: BOM 版本冻结、设备折旧口径细化和标准工时来源审批可在财务成本/跨角色全链路故事继续质疑。
- 相邻故事线索: 008 需继续验证技术员能看消耗对账、BOM/项目异常和 ABC 只读成本上下文，但不能改财务配置。
- 当前 git 状态: 2026-06-20 18:40 CST 复核时分支 `codex/abc-productization-phase0-1-2026-06-15` ahead 191，工作区含本轮和前序故事未提交改动；未回退无关改动。
