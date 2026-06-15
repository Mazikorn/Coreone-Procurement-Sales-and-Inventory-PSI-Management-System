# COREONE 发布检查清单

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `docs/00_Project_Governance_Framework.md`、`.github/workflows/`、`docs/09_Task_Backlog.md`
> **维护者**: Codex（AI 起草，PM 决策）

---

## 发布前必须满足

### 1. 需求验收状态

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 本次发布范围内需求均有验收记录 | 100% | ⚠️ 待 PM 验收确认；已有构建/测试证据，尚未形成 PM 签字结论 |
| 验收标准文档已更新 | `docs/07_Acceptance_Criteria.md` | ✅ 已建立 |
| PM 已确认验收结论 | 签字或邮件确认 | 待 PM 确认 |
| 当前工作树关键文件完整 | `app.ts` 引用的路由文件均存在 | ✅ 2026-06-15 目标 PR 分支前后端 build 通过，最终路由一致性检查无缺失 |

### 2. Bug 状态

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 无未确认 P0 Bug | 0 个 | ⚠️ 已重新清点一轮，旧 P0 中部分已修复；仍有供应商退货状态事务、调拨原库位、operator 来源等待处理/确认 |
| 无未确认 P1 Bug | 0 个 | ⚠️ 已重新清点一轮，部分需降级为验收/延期项；仍需 PM 确认优先级 |
| P2/P3 Bug 有明确延期理由 | 全部标注 | ⚠️ 待 PM 确认延期理由 |

### 3. 测试状态

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 核心 E2E 通过 | 当前存在的核心 spec 通过 | ❌ PR #1 GitHub Actions `e2e` 256/257 通过，唯一失败：`BF-PERM-technician-outbound` |
| 完整 E2E 通过率 | ≥95% | ⚠️ 本轮未跑完整 E2E；需作为合并后/发布前回归项 |
| 后端单元测试通过 | 100% | ✅ 2026-06-15 `npm run test:node` 8 files / 87 tests passed |
| 前端单元测试通过 | 100% | ❌ 2026-06-15 `npm test` 81/84 passed，3 个失败集中在 `useInventoryPage.test.ts` |
| 关键业务流 E2E 覆盖 | 入库/出库/盘点/BOM/成本 | ✅ |

### 4. 数据库变更

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 有迁移说明 | 新增表/字段文档化 | ✅ `docs/06_Data_Object_List.md` |
| 兼容说明 | 旧数据库可升级 | ✅ 后端通过 `PRAGMA table_info` 增量补列；目标 PR 后端 build/test 通过 |
| 回滚方案 | 明确回滚步骤 | ⚠️ 代码可 revert；数据库回滚仍需发布前备份确认 |

### 5. 权限变更

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 权限矩阵已更新 | `docs/05_Role_Permission_Matrix.md` | ✅ 已建立 |
| 角色测试已覆盖 | E2E roles.spec.ts | ❌ PR #1 核心 E2E 暴露 technician `/outbound` 权限预期冲突；跨模块 API 权限测试仍待补 |
| 前端菜单与后端一致 | 三方核对 | ⚠️ 路由缺失已修复；菜单/后端角色差异仍需 PM 确认业务意图 |

### 6. 文档变更

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| PRD 已更新 | `docs/02_PRD.md` | ✅ |
| 业务规则已更新 | `docs/04_Business_Rules.md` | ✅ |
| 验收标准已更新 | `docs/07_Acceptance_Criteria.md` | ✅ |
| 变更日志已更新 | `docs/10_Change_Log.md` | ✅ |
| Bug 日志已更新 | `docs/11_Bug_Log.md` | ✅ |

### 7. 安全检查

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 无硬编码密钥 | 使用 .env | ⚠️ 已在 PR 分支从 Git 索引移除 `前端代码/.env`、`后端代码/server/.env`；历史提交若含真实密钥需轮换 |
| 所有用户输入已验证 | express-validator | ⚠️ 登录已有校验；全路由输入校验仍待专项审计 |
| SQL 参数化查询 | 无字符串拼接 | ⚠️ 后端测试通过，但未完成全量 SQL 安全审计 |
| 错误消息不泄露内部细节 | 统一错误码 | ⚠️ 待专项审计 |
| 认证/授权在每个路由验证 | requireRole | ⚠️ 入口路由已有 authenticateToken/requireRole 覆盖；跨模块角色 E2E/API 权限仍待补 |

### 8. 回滚方案

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 代码回滚 | `git revert` 或 `git reset` | 待确认 |
| 数据库回滚 | 备份 + 恢复步骤 | 待确认 |
| 配置回滚 | .env 和 Docker 配置 | 待确认 |

---

## 发布流程

### Step 1：发布前检查

```bash
# 1. 运行核心 E2E（按本次发布范围增减）
cd 前端代码 && npx playwright test e2e/auth.spec.ts e2e/roles.spec.ts e2e/suppliers.spec.ts

# 2. 运行后端测试
cd 后端代码/server && npm run test

# 3. 运行前端测试
cd 前端代码 && npm run test

# 4. 检查构建
cd 前端代码 && npm run build
```

### Step 2：数据库备份

```bash
# 备份 SQLite 数据库
cp 后端代码/server/data/coreone.db 后端代码/server/data/coreone.db.backup-$(date +%Y%m%d)
```

### Step 3：部署

```bash
# Docker 部署
docker compose down
docker compose build
docker compose up -d

# 或手动部署
cd 后端代码/server && npm run build && npm run start
cd 前端代码 && npm run build
```

### Step 4：发布后验证

```bash
# 1. 健康检查
curl http://localhost:3001/api/health

# 2. 登录验证
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 3. 核心流程验证
# 以 PM 测试用例 TC-AUTH-001 ~ TC-INV-002 为准
```

### Step 5：回滚（如需要）

```bash
# 代码回滚
git revert HEAD

# 数据库回滚
cp 后端代码/server/data/coreone.db.backup-YYYYMMDD 后端代码/server/data/coreone.db

# Docker 回滚
docker compose down
docker compose up -d
```

---

## 发布决策

| 决策 | 条件 | 操作 |
|------|------|------|
| 可发布 | P0 Bug = 0，核心 E2E 通过，PM 确认 | 执行发布流程 |
| 有条件发布 | P0 Bug = 0，P1 Bug 有延期理由 | PM 确认后发布 |
| 不可发布 | P0 Bug > 0、核心 E2E 失败、后端启动/构建失败、关键路由文件缺失 | 修复后重新检查 |

**当前建议结论（2026-06-15）**：PR 可以继续审查，但保持 Draft，不建议合并。后端构建/测试、前端类型检查/构建、路由一致性已通过；GitHub `e2e` 已从“后端启动失败”推进到真实用例结果，但仍有 1 个权限用例失败：technician 访问 `/outbound` 未被拦截。合并前至少需要 PM 明确 technician 是否应拥有出库访问权限，并由团队按结论修复代码或调整测试预期；同时仍需处理或豁免前端单测、lint、权限差异和剩余 P0/P1 治理项。

---

## PM 最终确认

| 确认项 | PM 判断 |
|--------|---------|
| 是否满足发布条件 | 待确认 |
| 是否需要延期 | 待确认 |
| 回滚方案是否就绪 | 待确认 |
| 发布时间 | 待确认 |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 治理框架 | `docs/00_Project_Governance_Framework.md` |
| 待办清单 | `docs/09_Task_Backlog.md` |
| Bug 日志 | `docs/11_Bug_Log.md` |
| 变更日志 | `docs/10_Change_Log.md` |
| 验收标准 | `docs/07_Acceptance_Criteria.md` |
