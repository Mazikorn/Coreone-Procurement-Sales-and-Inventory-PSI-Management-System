# 第十四批任务：master-aligned 分支独立回归

> 日期：2026-06-15
> 执行设备：第二台设备
> 任务类型：独立验证
> 允许改动：仅报告与 session log

## 一、目标

验证主设备新建的 master-aligned 分支是否可以作为后续 PR/合并主干的候选分支。

该分支与之前的集成分支不同：

- 分支基线来自 `origin/master`
- 不存在无共同历史的问题
- 已迁移前后端产品源码、测试、配置
- 已排除数据库文件、日志、Playwright 报告、历史计划、skills 等噪音文件

## 二、准备

请使用独立 worktree，避免污染当前工作区。

```bash
cd /Users/maxiaoyuan/Documents/进销存
git fetch origin
mkdir -p .worktrees
git worktree add .worktrees/fourteenth-master-aligned-regression \
  -b collaboration/2026-06-15-fourteenth-master-aligned-regression \
  origin/codex/master-aligned-integration-2026-06-15
cd .worktrees/fourteenth-master-aligned-regression
git status --short --branch
git log --oneline -8
```

## 三、验证命令

### 1. 分支关系确认

```bash
git rev-parse HEAD
git rev-parse origin/master
git merge-base HEAD origin/master
git rev-list --left-right --count origin/master...HEAD
git diff --stat origin/master...HEAD | sed -n '1,120p'
```

期望：

- `merge-base` 必须存在。
- 不允许再出现“无共同祖先”。
- diff 应主要集中在 `前端代码`、`后端代码/server`、`docs/collaboration-workflow`。

### 2. 后端验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/fourteenth-master-aligned-regression/后端代码/server
npm ci
npm run build
npm test
npm start
```

另开一个终端或后台请求：

```bash
curl -sS http://localhost:3001/api/health
```

完成后关闭后端服务。

期望：

- `npm ci` 通过。
- `npm run build` 通过。
- `npm test` 通过，测试数量应为 87 个。
- `/api/health` 返回 `{"success":true,"data":{"status":"ok"}}`。

### 3. 前端验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/fourteenth-master-aligned-regression/前端代码
npm ci
npx tsc --noEmit
npm run build
```

说明：

- 当前前端没有 `npm run tsc` script，请使用 `npx tsc --noEmit`。
- Vite chunk size warning 可以记录，但不作为阻断。

### 4. 页面走查

按第十/十一批同等级页面走查执行。至少覆盖：

- 登录
- Dashboard
- Materials
- Locations
- Inbound
- Outbound
- Inventory
- BOM
- Reports / Cost Analysis

记录通过/失败页面数量。若后端能启动，页面走查必须尝试。

## 四、禁止事项

- 不改业务代码。
- 不改前后端源码。
- 不提交 `node_modules`、`dist`、日志、数据库文件、Playwright 报告。
- 不 merge master。
- 不 force push。
- 不使用 `--allow-unrelated-histories`。

如发现问题，只写入报告，交回主设备处理。

## 五、报告路径

请新增：

- `docs/collaboration-workflow/reports/2026-06-15-fourteenth-master-aligned-regression.md`
- `.claude/session-log/2026-06-15-fourteenth-master-aligned-regression.md`（可选但推荐）

报告需包含：

- 分支 HEAD
- master HEAD
- merge base
- 后端验证结果
- 前端验证结果
- 页面走查结果
- 阻断项
- 是否建议进入 PR / 合并准备

## 六、提交与推送

```bash
git status --short
git add docs/collaboration-workflow/reports/2026-06-15-fourteenth-master-aligned-regression.md .claude/session-log/2026-06-15-fourteenth-master-aligned-regression.md
git commit -m "docs(collaboration): add fourteenth batch master-aligned regression report"
git push -u origin collaboration/2026-06-15-fourteenth-master-aligned-regression
```

若 `.claude/session-log/...` 没有创建，则不要强行 add 该文件。

---

*任务发起：主设备*
