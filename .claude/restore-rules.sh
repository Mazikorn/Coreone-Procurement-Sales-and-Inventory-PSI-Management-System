#!/bin/bash
# 恢复项目规则文件（在需要完整功能时运行）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Restoring project rule files..."
cp "$PROJECT_ROOT/.claude/rules-bak/CLAUDE.md" "$PROJECT_ROOT/CLAUDE.md"
cp "$PROJECT_ROOT/.claude/rules-bak/coreone-guardrails.md" "$PROJECT_ROOT/.claude/rules/coreone-guardrails.md"
cp "$PROJECT_ROOT/.claude/rules-bak/skills-auto-trigger.md" "$PROJECT_ROOT/.claude/rules/skills-auto-trigger.md"
cp "$PROJECT_ROOT/.mcp.json.full-bak" "$PROJECT_ROOT/.mcp.json"
echo "Done. Files restored."
echo "Please start a new Claude Code session for changes to take effect."
