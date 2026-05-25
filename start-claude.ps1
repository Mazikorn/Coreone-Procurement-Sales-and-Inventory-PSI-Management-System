# Claude Code CLI 启动脚本 - 使用 Kimi API
$env:ANTHROPIC_BASE_URL = "https://api.kimi.com/coding/"
$env:ANTHROPIC_API_KEY = "sk-kimi-WWWyoIKCtODReaD2ZbwVxBP54HTcUrw9EKkJcxQL3NoIxi1BYuctNGC9AH9uwLnx"
$env:ANTHROPIC_MODEL = "kimi-for-coding"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "kimi-for-coding"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "kimi-for-coding"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "kimi-for-coding"

Write-Host "正在启动 Claude Code CLI (Kimi API)..." -ForegroundColor Green
Write-Host "Base URL: $env:ANTHROPIC_BASE_URL" -ForegroundColor Cyan
Write-Host "Model: $env:ANTHROPIC_MODEL" -ForegroundColor Cyan
Write-Host ""

claude
