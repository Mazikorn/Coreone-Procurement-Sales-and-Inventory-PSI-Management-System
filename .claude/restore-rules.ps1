# 恢复项目规则文件（在需要完整功能时运行）
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $projectRoot

Write-Host "Restoring project rule files..." -ForegroundColor Green

Copy-Item "$projectRoot\.claude\rules-bak\CLAUDE.md" "$projectRoot\CLAUDE.md" -Force
Copy-Item "$projectRoot\.claude\rules-bak\coreone-guardrails.md" "$projectRoot\.claude\rules\coreone-guardrails.md" -Force
Copy-Item "$projectRoot\.claude\rules-bak\skills-auto-trigger.md" "$projectRoot\.claude\rules\skills-auto-trigger.md" -Force
Copy-Item "$projectRoot\.mcp.json.full-bak" "$projectRoot\.mcp.json" -Force

Write-Host "Done. Files restored." -ForegroundColor Green
Write-Host "Please start a new Claude Code session for changes to take effect." -ForegroundColor Yellow
