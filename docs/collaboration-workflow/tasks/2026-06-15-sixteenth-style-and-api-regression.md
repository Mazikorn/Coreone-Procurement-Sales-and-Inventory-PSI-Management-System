# 第十六批任务：样式异常复现与 P1 API 回归

> 日期：2026-06-15
> 执行设备：第二台设备
> 任务类型：合并前阻断风险复核
> 允许改动：仅报告与 session log

## 一、目标

基于主设备最新分支重新验证：

1. 用户反馈的“前端组件样式全部丢失”是否仍可复现。
2. 第十四批发现的 3 个 P1 API 是否已修复。
3. 分支是否仍具备进入 PR / 合并准备的条件。

注意：即使测试和构建全部通过，只要样式丢失可复现，就不能建议合并。

## 二、准备

请使用新的独立 worktree，不要复用旧验证目录。

```bash
cd /Users/maxiaoyuan/Documents/进销存
git fetch origin
mkdir -p .worktrees
git worktree add .worktrees/sixteenth-style-api-regression \
  -b collaboration/2026-06-15-sixteenth-style-api-regression \
  origin/codex/master-aligned-integration-2026-06-15
cd .worktrees/sixteenth-style-api-regression
git status --short --branch
git rev-parse HEAD
git merge-base HEAD origin/master
```

期望：

- `merge-base` 必须存在。
- 工作区必须干净。
- HEAD 必须是最新远端 `origin/codex/master-aligned-integration-2026-06-15`。

## 三、后端验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/sixteenth-style-api-regression/后端代码/server
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
    | sed -n '1,25p'
done
```

期望：

- `npm test` 通过，测试数量应为 87 个。
- 三个接口 HTTP 状态码均为 200。
- 若任何接口 500，请记录响应体、后端日志和数据库路径。

完成后关闭后端服务。

## 四、前端构建验证

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/sixteenth-style-api-regression/前端代码
npm ci
npx tsc --noEmit
npm run build
```

期望：

- 类型检查通过。
- 生产构建通过。
- Vite chunk size warning 可记录，但不作为阻断。

## 五、样式复现专项

### 1. dev server 检查

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/sixteenth-style-api-regression/前端代码
npm run dev -- --host 127.0.0.1
```

浏览器打开：

- `http://127.0.0.1:8080`

登录：

- 用户名：`admin`
- 密码：`admin123`

至少检查并截图：

- 登录页
- Dashboard
- Materials
- Inbound
- Reports / Cost Analysis

### 2. preview server 检查

关闭 dev server 后执行：

```bash
cd /Users/maxiaoyuan/Documents/进销存/.worktrees/sixteenth-style-api-regression/前端代码
npm run preview -- --host 127.0.0.1 --port 4173
```

浏览器打开：

- `http://127.0.0.1:4173`

重复检查并截图：

- 登录页
- Dashboard
- Materials
- Inbound
- Reports / Cost Analysis

## 六、样式异常记录要求

如果复现“组件样式全部丢失”，报告必须包含：

- 当前分支 HEAD：`git rev-parse HEAD`
- 打开方式：dev server / preview server / 直接打开静态文件
- 具体 URL
- 截图
- 浏览器 Console 错误
- Network 中 CSS 文件状态码
- 页面中 CSS 文件 URL
- 是否硬刷新后仍复现

可用浏览器控制台执行：

```js
Array.from(document.styleSheets).map((sheet) => ({
  href: sheet.href,
  rules: (() => {
    try { return sheet.cssRules.length } catch { return 'blocked' }
  })()
}))
```

期望：

- CSS 文件状态码为 200。
- `cssRules.length` 不应全部为 0 或 blocked。
- 登录页和 Dashboard 应存在明显布局、颜色、间距和按钮样式。

## 七、禁止事项

- 不改业务代码。
- 不改前后端源码。
- 不提交 `node_modules`、`dist`、数据库文件、日志、截图二进制文件、Playwright 报告。
- 不 merge master。
- 不 force push。

如发现问题，只写入报告，交回主设备处理。

## 八、报告路径

请新增：

- `docs/collaboration-workflow/reports/2026-06-15-sixteenth-style-and-api-regression.md`
- `.claude/session-log/2026-06-15-sixteenth-style-and-api-regression.md`（可选）

报告必须包含：

- 分支 HEAD
- merge base
- 后端验证结果
- 三个 P1 API 结果
- 前端 typecheck/build 结果
- dev server 样式截图结论
- preview server 样式截图结论
- 是否仍复现样式丢失
- 是否建议进入 PR / 合并准备

## 九、提交与推送

```bash
git status --short
git add docs/collaboration-workflow/reports/2026-06-15-sixteenth-style-and-api-regression.md
test ! -f .claude/session-log/2026-06-15-sixteenth-style-and-api-regression.md || git add .claude/session-log/2026-06-15-sixteenth-style-and-api-regression.md
git commit -m "docs(collaboration): add sixteenth batch style and api regression report"
git push -u origin collaboration/2026-06-15-sixteenth-style-api-regression
```

---

*任务发起：主设备*
