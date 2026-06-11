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
| 本次发布范围内需求均有验收记录 | 100% | 待确认 |
| 验收标准文档已更新 | `docs/07_Acceptance_Criteria.md` | ✅ 已建立 |
| PM 已确认验收结论 | 签字或邮件确认 | 待 PM 确认 |

### 2. Bug 状态

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 无未确认 P0 Bug | 0 个 | ⚠️ 23 个 P0 待修复 |
| 无未确认 P1 Bug | 0 个 | ⚠️ 22 个 P1 待修复 |
| P2/P3 Bug 有明确延期理由 | 全部标注 | 待确认 |

### 3. 测试状态

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 核心 E2E 通过 | auth + supplier-returns 100% | ✅ Phase 3 完成 |
| 完整 E2E 通过率 | ≥95% | ⚠️ 待重跑验证 |
| 后端单元测试通过 | 100% | 待确认 |
| 前端单元测试通过 | 100% | 待确认 |
| 关键业务流 E2E 覆盖 | 入库/出库/盘点/BOM/成本 | ✅ |

### 4. 数据库变更

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 有迁移说明 | 新增表/字段文档化 | ✅ `docs/06_Data_Object_List.md` |
| 兼容说明 | 旧数据库可升级 | 待确认 |
| 回滚方案 | 明确回滚步骤 | 待确认 |

### 5. 权限变更

| 检查项 | 标准 | 当前状态 |
|--------|------|----------|
| 权限矩阵已更新 | `docs/05_Role_Permission_Matrix.md` | ✅ 已建立 |
| 角色测试已覆盖 | E2E roles.spec.ts | ✅ |
| 前端菜单与后端一致 | 三方核对 | ⚠️ 有差异待确认 |

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
| 无硬编码密钥 | 使用 .env | ⚠️ .env 需检查 |
| 所有用户输入已验证 | express-validator | ⚠️ 部分缺失 |
| SQL 参数化查询 | 无字符串拼接 | ✅ |
| 错误消息不泄露内部细节 | 统一错误码 | ✅ |
| 认证/授权在每个路由验证 | requireRole | ⚠️ 3 个模块缺失 |

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
# 1. 运行核心 E2E
cd 前端代码 && npx playwright test e2e/auth.spec.ts e2e/supplier-returns.spec.ts

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
| 不可发布 | P0 Bug > 0 或核心 E2E 失败 | 修复后重新检查 |

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
