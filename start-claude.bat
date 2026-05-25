@echo off
set ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
set ANTHROPIC_API_KEY=sk-kimi-WWWyoIKCtODReaD2ZbwVxBP54HTcUrw9EKkJcxQL3NoIxi1BYuctNGC9AH9uwLnx
set ANTHROPIC_MODEL=kimi-for-coding
set ANTHROPIC_DEFAULT_OPUS_MODEL=kimi-for-coding
set ANTHROPIC_DEFAULT_SONNET_MODEL=kimi-for-coding
set ANTHROPIC_DEFAULT_HAIKU_MODEL=kimi-for-coding
echo ========================================
echo 启动 Claude Code CLI (Kimi API)
echo Base URL: %ANTHROPIC_BASE_URL%
echo Model: %ANTHROPIC_MODEL%
echo ========================================
claude --bare
