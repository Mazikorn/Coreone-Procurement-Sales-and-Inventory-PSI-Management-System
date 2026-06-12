# 另一台设备启动说明

> 适用日期: 2026-06-12
> 执行方式: pull 文档后按任务单执行，只读扫描，不修改代码。

## 拉取步骤

在另一台设备项目目录执行:

```bash
git fetch origin
git checkout codex/governance-docs-accuracy
git pull --ff-only
```

如果本地已有未提交改动，先不要继续 pull，先把当前状态截图或复制 `git status --short` 给主会话确认。

## 开工前必须阅读

1. `AGENTS.md`
2. `.claude/SESSION-B-WORKLOG.md`
3. `docs/collaboration-workflow/README.md`
4. `docs/collaboration-workflow/tasks/2026-06-12-second-device-scan.md`

## 今日禁止事项

1. 不修改代码。
2. 不运行格式化全仓库命令。
3. 不碰后端路由。
4. 不碰布局权限组件。
5. 不提交代码修复。

## 今日产出

只产出一份扫描报告，按模板填写:

`docs/collaboration-workflow/templates/scan-report-template.md`

报告完成后，把内容发给主会话审核。主会话确认后，才进入下一批修复。
