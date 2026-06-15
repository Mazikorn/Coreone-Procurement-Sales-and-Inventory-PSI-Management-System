# 第十三批 master-aligned 迁移报告

> 日期：2026-06-15 13:33 CST
> 执行分支：`codex/master-aligned-integration-2026-06-15`
> 分支基线：`origin/master@afe8270`
> 迁移来源：`origin/codex/integration-collab-inventory-2026-06-12@246e06d`

## 一、背景

第十二批审计确认：已验证集成分支与 `origin/master` 没有共同 merge base，不能直接 merge，也不应使用 `--allow-unrelated-histories`。

本批次采用主干对齐方案：

1. 从 `origin/master` 新建正常历史分支。
2. 从已验证集成分支迁移可运行产品代码。
3. 不迁移数据库文件、日志、Playwright 报告、历史计划、skills、设计稿等高噪音内容。
4. 在 master-aligned 分支上重新验证后端、前端构建链路。

## 二、迁移范围

本批次迁移的是最小可运行闭环，不是全量 1020 文件差异。

### 已迁移

- 前端源码与必要配置：
  - `前端代码/src`
  - `前端代码/index.html`
  - `前端代码/package.json`
  - `前端代码/package-lock.json`
  - `前端代码/playwright.config.ts`
  - `前端代码/tsconfig.json`
  - `前端代码/tsconfig.app.json`
  - `前端代码/tsconfig.node.json`
  - `前端代码/vite.config.ts`
  - `前端代码/vitest.config.ts`
- 后端源码、测试、脚本与必要配置：
  - `后端代码/server/src`
  - `后端代码/server/tests`
  - `后端代码/server/scripts`
  - `后端代码/server/package.json`
  - `后端代码/server/package-lock.json`
  - `后端代码/server/tsconfig.json`
  - `后端代码/server/vitest.config.ts`
  - `后端代码/server/vitest.native.config.ts`
  - `后端代码/server/eslint.config.js`

### 未迁移

- `后端代码/server/data/*.db`
- `后端代码/server/*.log`
- `前端代码/playwright-report`
- `前端代码/e2e-report`
- 前端根目录大量历史 `*.txt` 验证输出
- `.claude/plans`
- `.claude/inspection`
- `.claude/fix-records`
- `skills`
- `V1.1设计稿`
- `data/*.png` / `data/*.webm`

## 三、变更规模

- 迁移后代码相关变更：240 个文件
- 新增：85 个文件
- 修改：155 个文件
- 变更行数：45121 insertions(+), 22471 deletions(-)

对比第十二批审计中的 1020 个文件差异，本批次显著降低了主干合并噪音。

## 四、验证结果

### 后端

- `npm ci`：通过
  - 9 个漏洞提示，与第十/十一批同类，不作为本批阻断。
- `npm run build`：通过
- `npm test`：通过
  - 8 个 test files
  - 87 个 tests
  - 测试服务器正常关闭
- `npm start` + `/api/health`：通过
  - 返回：`{"success":true,"data":{"status":"ok"}}`

### 前端

- `npm ci`：通过
  - 9 个漏洞提示，作为后续依赖治理事项，不作为本批阻断。
- `npx tsc --noEmit`：通过
  - 说明：当前 `package.json` 没有 `tsc` script，因此使用实际类型检查命令。
- `npm run build`：通过
  - Vite chunk size warning 与前几批一致，不作为阻断。

## 五、结论

master-aligned 分支已具备可继续验证的基础：

- 分支历史来自 `origin/master`，后续可正常 PR/merge。
- 已验证集成分支中的产品源码、测试、配置已迁移到主干历史上。
- 后端 build/test/start/health 通过。
- 前端 typecheck/build 通过。
- 暂未执行页面走查，需要第二台设备按第十四批任务做独立复核。

## 六、下一步

第二台设备执行第十四批 master-aligned 回归：

- 基于 `origin/codex/master-aligned-integration-2026-06-15` 创建独立验证分支。
- 重跑后端 `npm ci` / `build` / `test` / `start + health`。
- 重跑前端 `npm ci` / `npx tsc --noEmit` / `npm run build`。
- 尝试页面走查，重点覆盖第十/十一批的 9 个页面。
- 只提交报告和 session log，不改业务代码。

---

*执行者：主设备*
