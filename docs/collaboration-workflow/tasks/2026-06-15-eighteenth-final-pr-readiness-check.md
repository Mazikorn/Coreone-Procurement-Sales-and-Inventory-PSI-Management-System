# 第十八批任务：PR 前最终轻量复核

> 日期：2026-06-15
> 执行设备：第二台设备
> 任务类型：合并前最终复核
> 允许改动：仅报告与 session log

## 一、目标

验证主设备第十七批修复后，当前 master-aligned 分支是否可以进入 PR / 合并准备。

本批不再做大范围探索，只确认三个风险点：

1. 三个 P1 API 均为 200。
2. 前端构建仍通过。
3. dev server 和 preview server 页面样式仍正常。

## 二、准备

请使用新的独立 worktree。

```bash
cd /Users/maxiaoyuan/Documents/进销存
git fetch origin
mkdir -p .worktrees
git worktree add .worktrees/eighteenth-final-pr-readiness \
  -b collaboration/2026-06-15-eighteenth-final-pr-readiness \
  origin/codex/master-aligned-integration-2026-06-15
cd .worktrees/eighteenth-final-pr-readiness
git status --short --branch
git rev-parse HEAD
git merge-base HEAD origin/master
```

期望：

- 工作区干净。
- `merge-base` 存在。
- HEAD 为最新远端集成分支。

## 三、后端验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/eighteenth-final-pr-readiness/后端代码/server
npm ci
npm run build
npm test
npm start
```

后端启动后，另开终端执行：

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.data?.token||j.token||'')})")

for endpoint in \
  /api/v1/inbound/stats \
  /api/v1/purchase-orders \
  /api/v1/reports/cost-by-material
do
  echo "== $endpoint =="
  curl -sS -i "http://127.0.0.1:3001${endpoint}" \
    -H "Authorization: Bearer $TOKEN" \
    | sed -n '1,20p'
done
```

期望：

- `npm test` 通过，测试数量为 87。
- 三个接口均返回 HTTP 200。

完成后关闭后端服务。

## 四、前端验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/eighteenth-final-pr-readiness/前端代码
npm ci
npx tsc --noEmit
npm run build
```

期望：

- 类型检查通过。
- 构建通过。
- Vite chunk size warning 可记录，不作为阻断。

## 五、样式截图复核

### dev server

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/eighteenth-final-pr-readiness/前端代码
npm run dev -- --host 127.0.0.1
```

打开 `http://127.0.0.1:8080`，登录 `admin / admin123`。

检查：

- 登录页
- Dashboard
- Inbound
- Cost Analysis

### preview server

关闭 dev server 后：

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/eighteenth-final-pr-readiness/前端代码
npm run preview -- --host 127.0.0.1 --port 4173
```

打开 `http://127.0.0.1:4173`，登录 `admin / admin123`。

检查：

- 登录页
- Dashboard
- Inbound
- Cost Analysis

样式期望：

- 页面布局、颜色、间距、按钮、卡片均正常。
- CSS 文件状态码为 200。
- 若样式丢失，记录截图、Console、Network CSS 状态和 `document.styleSheets` 输出。

## 六、报告路径

请新增：

- `docs/collaboration-workflow/reports/2026-06-15-eighteenth-final-pr-readiness-check.md`
- `.claude/session-log/2026-06-15-eighteenth-final-pr-readiness-check.md`（可选）

报告必须包含：

- 分支 HEAD
- merge base
- 后端 build/test 结果
- 三个 P1 API 状态码
- 前端 typecheck/build 结果
- dev server 样式结论
- preview server 样式结论
- 是否建议进入 PR / 合并准备

## 七、提交与推送

```bash
git status --short
git add docs/collaboration-workflow/reports/2026-06-15-eighteenth-final-pr-readiness-check.md
test ! -f .claude/session-log/2026-06-15-eighteenth-final-pr-readiness-check.md || git add .claude/session-log/2026-06-15-eighteenth-final-pr-readiness-check.md
git commit -m "docs(collaboration): add eighteenth batch final readiness report"
git push -u origin collaboration/2026-06-15-eighteenth-final-pr-readiness
```

---

*任务发起：主设备*
