# 系统管理员创建用户、分配角色并回看操作日志 用户故事收口记录

## 故事边界

- 故事: 作为管理员，我要创建用户、分配角色并回看操作日志，以便各岗位只看到并处理自己职责内的工作
- 角色: 系统管理员
- 用户目标: 新用户可登录，角色权限正确，关键操作可审计
- 涉及页面: `/users`, `/roles`, `/logs`, `/`
- 涉及后端/API/数据表: `/api/v1/auth/login`, `/api/v1/users`, `/api/v1/roles`, `/api/v1/logs`; `users`, `roles`, `operation_logs`, `login_attempts`
- 上游输入: 内置角色、权限矩阵、自定义角色权限配置
- 下游交接: 各岗位账号、角色菜单、API 权限、操作日志追踪
- 明确不做: 不处理非当前故事的采购、库存、BOM、ABC 成本业务修复；非管理员以外的日志查看口径作为相邻故事线索记录。

## 当前检索记录

- 角色菜单/路由: `前端代码/src/lib/permissions.ts` 中 admin 含 `/users`, `/roles`, `/logs`; `App.tsx` 对三页使用 `RoleRoute`; `AppSidebar.tsx` 按 `getAllowedPaths()` 展示菜单。
- 前端页面/组件/hook: `Users.tsx`, `Roles.tsx`, `Logs.tsx`; `useUsersPage.ts`, `useRolesPage.ts`, `useLogsPage.ts`; `UserFormModal.tsx`, `RolesGrid.tsx`, `RoleFormModal.tsx`, `LogsTable.tsx`, `LogExportModal.tsx`。
- 后端路由/权限/副作用: `app.ts` 对 `/users` 和 `/roles` 使用 `requireStrictRole('admin')`; `/logs` 使用 `requireRole('admin','finance')`，清理日志端点二次限制 admin; `users-v1.1.ts`, `roles-v1.1.ts`, `logs-v1.1.ts` 写入 `operation_logs`。
- 数据表/审计日志: `users` 保存账号、角色、状态、最后登录; `roles` 保存权限和数据范围; `operation_logs` 保存登录、创建用户、创建角色、导出/清理等审计记录。
- 测试: `users-reset.test.ts`, `roles-guard.test.ts`, `logs.test.ts`, `auth.test.ts`; 前端历史 E2E 文件仅作为线索，本次不作为完成证明。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, `docs/02_PRD.md`。
- 库存/BOM/出库/成本/预警/审计影响: 当前故事是权限与审计底座。修复后，自定义角色只能进入其权限对应页面和 API；admin 账号不会被降权导致后续采购、库存、BOM、成本链路无人可管；创建用户/角色和登录可在操作日志回看。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | admin 管理用户、角色、日志；其他角色不显示系统设置三页 | 基本合理；日志读权限后端给 finance，超出本故事但符合财务审计线索 | 系统底座和财务审计口径需后续故事继续复核 | 当前故事完成；finance 日志访问记为相邻线索 |
| 用户目标是否完整 | 管理员可创建自定义角色、创建用户并分配角色，新用户可登录 | 主流程完整 | 后续角色能接住自己的菜单和 API 权限 | 已验证 |
| 信息字段是否够用 | 用户表含用户名、姓名、部门、角色、状态、最后登录；角色表含权限和数据范围 | 主流程够用；部门前端标必填但后端允许为空，是低风险口径差异 | 不阻断账号交接，后续可统一表单/接口字段要求 | 记为 P3 |
| 交接关系是否正确 | 角色权限随登录返回，前端由权限映射菜单，后端按权限/严格角色拒绝越权 | 创建用户后能登录并看到对应权限菜单 | 各岗位账号可交给下游角色使用 | 已验证 |
| 状态流转是否合理 | 停用用户不能登录；停用角色后该角色用户不能继续登录；admin 不可停用/删除 | 原实现缺少 admin 角色保护，已修复 | 防止系统管理员账号被降权导致权限底座断裂 | RS-001-01 fixed |
| 用户工作量是否合理 | 管理员可在页面完成角色和用户配置，日志页可筛选回看 | 弱密码会增加账号安全与后续人工排查成本，已修复 | 减少账号泄露和审计追责成本 | RS-001-02 fixed |
| 是否支撑成本/审计 | 操作日志记录登录、创建用户、创建角色、日志导出等动作 | 能支撑追责；本故事不直接改库存/BOM/出库/成本 | 为后续事实链提供人员和权限来源 | 已验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-001-01 | 权限底座 | `USER-001/admin` 不能删除/停用，但可通过 `PUT /api/v1/users/USER-001 { role: 'technician' }` 被降权 | RED: `USER-ADMIN-PROTECT-001` 初次运行收到 200 | admin 保护、菜单/API 权限、后续所有角色治理 | P1 | 后端禁止内置 admin 账号角色改为非 admin | 后端测试 + Playwright/API 实测 409 | fixed/verified |
| RS-001-02 | 安全/用户交接 | 手填初始密码/重置密码只要求 8 位，`password1` 可通过 | RED: `USER-INPUT-001/002` 初次运行收到 201/200 | 新用户登录安全、长期运维和审计追责 | P1 | 后端和前端统一要求大小写字母、数字、符号和至少 8 位；随机密码保证包含数字 | 后端测试 + Playwright 弱密码 toast 实测 | fixed/verified |
| RS-001-03 | 字段口径 | 新建用户前端部门标必填，后端不强制 | 代码检索: `UserFormModal.tsx` 标星，`users-v1.1.ts` `department` optional | 低频字段一致性，不影响账号创建/角色交接 | P3 | 暂缓；后续统一字段契约时处理 | 记录线索 | recorded |
| RS-001-04 | 相邻权限口径 | `/logs` 后端允许 finance 查看，但本故事只要求管理员回看日志 | `app.ts` `/logs` 使用 `requireRole('admin','finance')` | 财务审计故事需要复核是否符合职责 | P3 | 不抢跑，留给财务故事 | 记录线索 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-001-01 | `后端代码/server/src/routes/users-v1.1.ts` | 新增内置 admin 账号角色保护，拒绝将 `USER-001/admin` 更新为非 admin，返回 409 |
| RS-001-02 | `后端代码/server/src/routes/users-v1.1.ts` | 收紧手填初始密码、重置密码、编辑密码策略，要求大小写字母、数字、符号和至少 8 位 |
| RS-001-02 | `前端代码/src/pages/system/hooks/useUsersPage.ts` | 创建用户弹窗提交前先拦截弱密码，避免前端成功预期与后端拒绝不一致 |
| RS-001-02 | `前端代码/src/pages/system/components/UserFormModal.tsx` | 更新初始密码提示；前端随机密码生成器追加确定性数字，和强密码规则一致 |
| RS-001-01/02 | `后端代码/server/tests/users-reset.test.ts` | 新增 admin 降权保护、弱但 8 位密码拒绝、随机临时密码满足强策略断言 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 启动状态 | `git status --short --branch` | 启动时工作树干净，分支 ahead 191 | `## codex/abc-productization-phase0-1-2026-06-15...origin/... [ahead 191]` |
| 启动提交 | `git log --oneline --decorate -n 40` | 最新提交为角色故事目标文档 | `a7c2a15 docs: add role story goal workflow` |
| Playwright 前置规则 | 读取 AGENTS.md 和两条指定记忆文件 | 已确认禁止默认下载、需先验本地缓存/备份 | Chromium 1217 / Chrome for Testing 147.0.7727.15 |
| Playwright 缓存 | `find ~/Library/Caches/ms-playwright ...`; `test -x`; `--version` | 本地缓存存在，可执行文件可运行 | `Google Chrome for Testing 147.0.7727.15` |
| Playwright 真实 launch | `node -e "import('playwright')..."` | 真实浏览器启动成功 | title: `chromium-path-ok` |
| RED 验证 | `npm run test -- tests/users-reset.test.ts` | 新增 3 个验收失败，证明缺陷存在 | admin 降权 200；`password1` 创建 201；`password1` 重置 200 |
| GREEN 验证 | `npm run test -- tests/users-reset.test.ts` | 15/15 passed | 覆盖 admin 降权 409、强密码策略、随机密码强度 |
| 角色/日志回归 | `npm run test -- tests/roles-guard.test.ts tests/logs.test.ts tests/auth.test.ts` | 23/23 passed（实际收集 roles/logs 两个文件） | 系统角色保护、自定义角色鉴权、日志筛选/导出/清理通过 |
| 后端构建 | `npm run build` in `后端代码/server` | passed | `tsc` 成功 |
| 前端构建 | `npm run build` in `前端代码` | passed with chunk-size warning | Vite build 成功，chunk warning 与本故事无关 |
| 真实页面故事闭环 | Playwright 登录 admin，创建自定义角色，创建用户，登录新用户，回看日志 | passed | role `ROLE-1781943800423`, user `storyuser1781943798528`, logs page 显示 `创建用户 storyuser...` |
| 后端副作用/权限 | Playwright 脚本内 API 查询 `/roles`, `/users`, `/logs`; `PUT /users/USER-001`; 新用户 `GET /users` | passed | 自定义角色含 `inventory:view`; 用户返回该权限; admin 降权 409; 新用户 `/users` 403 |
| 数据清理 | SQLite 查询 `storyuser%` 和 `故事复核角色-%` | 测试用户/角色均为软删除，审计日志保留 | `is_deleted = 1` |
| 服务收口 | `lsof -nP -iTCP:3001/8080 -sTCP:LISTEN` | 无残留监听 | 输出为空 |

## 故事收口报告

- P0/P1 是否清零: 是。RS-001-01 和 RS-001-02 均已 fixed/verified。
- 影响角色交接或事实链的 P2 是否清零: 是。本故事未留下影响账号交接或审计事实链的 P2。
- 角色职责/权限边界是否合理: 是。admin 可管理用户、角色、日志；自定义角色用户只能看到和访问其权限对应功能；非 admin 后端访问 `/users` 被拒绝。
- 页面/弹窗验证: 已用真实浏览器验证 `/roles` 新建角色弹窗、`/users` 新建用户弹窗弱密码提示与强密码创建、`/logs` 页面筛选回看创建用户日志。
- 前后端权限一致性验证: 已验证 admin 菜单可见；新用户菜单不显示用户/角色/日志；直输 `/users` 被前端重定向；新用户 API 访问 `/users` 返回 403；admin 账号降权 API 返回 409。
- 后端/API/数据库验证: 已验证角色、用户、日志 API 返回真实副作用；测试用户和测试角色验证后软删除；日志保留。
- 数据回看验证: 用户列表 API 回看新用户角色和权限；日志页和日志 API 回看创建用户记录。
- 库存/BOM/出库/成本/预警/审计影响: 本故事不直接写库存/BOM/出库/成本/预警事实，但修复权限底座，保证后续岗位账号不会越权或失去 admin 管理能力；操作日志支撑后续审计追责。
- 未处理 P3: RS-001-03 部门字段前后端必填口径不一致；RS-001-04 finance 日志查看口径留给财务/审计故事复核。
- 相邻故事线索: story 002 可复核管理员基础资料字段必填和历史事实保护；story 010/011 可复核 finance 查看 `/logs` 是否符合财务关账和审计职责。
- 当前 git 状态: 有本故事相关代码与文档改动，工作树未清理；未发现无关文件修改。
