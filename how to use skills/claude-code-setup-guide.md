# Claude Code 全自动技能配置指南

适用版本: Claude Code >= 2.1

---

## 快速安装（一键脚本）

在目标项目根目录下执行：

```bash
bash <(curl -s https://raw.githubusercontent.com/obra/superpowers/main/install.sh) 2>/dev/null

# ============ 1. Skills ============
npx skills add obra/superpowers -g -y
npx skills add JuliusBrussee/caveman -g -y
npx skills add alirezarezvani/claude-skills -g -y
npx skills add OthmanAdi/planning-with-files -g -y

# ============ 2. MCP ============
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
claude mcp add playwright -- npx @playwright/mcp@latest

# ============ 3. Marketplace ============
claude plugin marketplace add FradSer/dotclaude
claude plugin marketplace add anthropics/claude-plugins-official

# ============ 4. Plugins ============
claude plugin install code-simplifier@claude-plugins-official
npx claude-mem install -y

# ============ 5. Bun (claude-mem 依赖) ============
# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS/Linux:
curl -fsSL https://bun.sh/install | bash
```

---

## 详细说明

### 1. Skills（命令式技能）

安装位置: `~/.agents/skills/`

#### obra/superpowers（14 个技能）

| 技能 | 用途 | 触发条件 |
|------|------|----------|
| brainstorming | 需求澄清、方案探讨 | 用户描述新功能 |
| writing-plans | 编写实现计划 | 方案确定后 |
| executing-plans | 执行计划 | 计划就绪 |
| subagent-driven-development | 子代理并行开发 | 复杂多步骤任务 |
| test-driven-development | 红-绿-重构循环 | 新功能/修 bug |
| systematic-debugging | 根因分析调试 | 遇到 bug |
| verification-before-completion | 完成前验证 | 每次代码修改后 |
| requesting-code-review | 多角度代码审查 | 代码写完后 |
| receiving-code-review | 处理审查反馈 | 收到审查意见 |
| finishing-a-development-branch | 分支收尾 | 准备提交时 |
| dispatching-parallel-agents | 并行任务分发 | 3+ 独立操作 |
| using-git-worktrees | 隔离工作区 | 多分支并行开发 |
| using-superpowers | 技能使用指南 | 查看可用技能 |
| writing-skills | 编写新技能 | 创建自定义技能 |

#### JuliusBrussee/caveman（7 个技能）

| 技能 | 用途 |
|------|------|
| caveman | 精简输出模式，节省 ~65% token |
| caveman-commit | 精简版 conventional commit |
| caveman-review | 精简版代码审查 |
| caveman-compress | 压缩长对话上下文 |
| caveman-stats | 查看 token 使用统计 |
| caveman-help | 帮助信息 |
| cavecrew | 批量 caveman 模式 |

#### alirezarezvani/claude-skills（311 个技能）

按领域分类：

| 领域 | 数量 | 典型技能 |
|------|------|----------|
| Engineering | 24 | api-design-reviewer, code-optimizer, tech-debt-assessor |
| Engineering Advanced | 25 | microservices-architect, performance-profiler |
| Marketing | 43 | seo-strategist, content-writer, ad-copy-creator |
| C-Level Advisory | 28 | architecture-advisor, make-or-buy-analyzer |
| Product | 12 | prd-writer, user-story-mapper, roadmap-planner |
| Regulatory/Quality | 12 | compliance-checker, risk-assessor |
| Finance | 2 | financial-modeler, budget-planner |
| Business/Growth | 4 | growth-strategist, pricing-strategist |
| Project Management | 6 | agile-scrum-master, stakeholder-manager |

#### OthmanAdi/planning-with-files（7 个技能）

| 技能 | 用途 |
|------|------|
| planning-with-files | 英文版，持久化任务计划 |
| planning-with-files-zh | 简体中文版 |
| planning-with-files-zht | 繁体中文版 |
| planning-with-files-ar | 阿拉伯语版 |
| planning-with-files-de | 德语版 |
| planning-with-files-es | 西班牙语版 |
| pi-planning-with-files | PI 规划版本 |

---

### 2. MCP 服务器（工具级自动调用）

安装位置: `~/.claude.json` → `projects.<项目路径>.mcpServers`

| MCP | 命令 | 工具 | 何时自动调用 |
|-----|------|------|-------------|
| Context7 | `@upstash/context7-mcp` | resolve-library-id, get-library-docs | 使用第三方库时查最新文档 |
| Playwright | `@playwright/mcp` | 浏览器导航/截图/填表 | UI 测试、截图、调试 |

---

### 3. 插件

安装位置: `~/.claude/plugins/cache/`

| 插件 | 市场 | 用途 |
|------|------|------|
| code-simplifier | claude-plugins-official | 代码简化，去冗余，保持功能不变 |
| claude-mem | thedotmack | 跨会话记忆持久化，SQLite + 向量检索 |

#### FradSer/dotclaude 市场中可用插件（按需安装）

```bash
claude plugin install review@frad-dotclaude       # 多代理代码审查
claude plugin install git@frad-dotclaude          # AI 质量检查 + Conventional commits
claude plugin install github@frad-dotclaude       # PR/issue 创建 + TDD workflow
claude plugin install refactor@frad-dotclaude     # 47 种 Next.js 重构模式
claude plugin install superpowers@frad-dotclaude  # BDD 驱动开发 + Agent Team
claude plugin install office@frad-dotclaude       # 中文专利/飞书文档/PRD
```

---

### 4. CLAUDE.md 自动规则

在项目根目录创建 `CLAUDE.md`，内容参见本仓库根目录的 [CLAUDE.md](../../CLAUDE.md)。

核心结构：

```markdown
# CLAUDE.md

## Auto-Invoke Rules

### Skills — Proactive Triggers
| 触发条件 | 自动调用技能 | 说明 |
|----------|-------------|------|
| 新功能/复杂任务 | /brainstorming → /writing-plans | ... |
| ... | ... | ... |

### MCP Servers — Automatic Tool Use
Context7: 第三方库 → 自动查最新文档
Playwright: UI 测试 → 自动浏览器验证

### Plugins — Automated Behaviors
code-simplifier: 100+ 行代码后 → /simplify
claude-mem: 会话开始/结束 → 自动记忆

## Development Workflow (Auto-Applied)
0. RESEARCH → 1. PLAN → 2. IMPLEMENT → 3. REVIEW → 4. SIMPLIFY → 5. VERIFY → 6. PERSIST
```

---

### 5. settings.json Hooks

项目级别 `.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const p=process.env.FILE_PATH; if(p&&/\\.(ts|tsx|css|scss)$/.test(p)) console.log('[Hint] Consider /simplify to clean up, /verification-before-completion to validate.')\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');const p='task_plan.md';if(fs.existsSync(p)){const c=fs.readFileSync(p,'utf8');const done=(c.match(/\\[x\\]/gi)||[]).length;const total=(c.match(/\\[ \\]/gi)||[]).length+done;console.log('[Session End] task_plan.md: '+done+'/'+total+' tasks done');if(done<total)console.log('[Session End] '+ (total-done) +' tasks remaining for next session.')}\""
          }
        ]
      }
    ]
  }
}
```

> **格式说明 (Claude Code >= 2.x)**：`command` 需嵌套在 `hooks` 数组内，每个条目需 `"type": "command"`。`matcher` 使用正则表达式（如 `"Write|Edit"`）。Stop/Setup/SessionStart 等生命周期 hook 不需要 `matcher`。

---

### 6. 验证安装

```bash
# 查看已安装的 skills
npx skills list -g

# 查看已注册的 marketplace
claude plugin marketplace list

# 查看已安装的 plugins
claude plugin list

# 查看 MCP 服务器状态
claude mcp list

# 检查 Bun（claude-mem 依赖）
bun --version
```

期望输出：
- skills: ~340 个（14 + 7 + 311 + 7）
- marketplaces: frad-dotclaude, claude-plugins-official, thedotmack
- plugins: code-simplifier ✅, claude-mem ✅
- MCP: context7 ✅, playwright ✅, claude-mem:mcp-search ✅

---

## 常见问题

### Q: 安装后报 "Bun not found"

claude-mem 依赖 Bun 运行时，需安装：
```bash
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### Q: 安装后报 "printf: write error: Permission denied"

Windows + Git Bash 环境下 claude-mem hooks 的已知问题。安装 Bun 后会自动修复。

### Q: 不想安装某一部分

- 不装 claude-mem: 跳过 `npx claude-mem install -y` 和 Bun 安装
- 不装 Caveman: 跳过 `npx skills add JuliusBrussee/caveman`
- 不装 Playwright MCP: 跳过 `claude mcp add playwright`

### Q: 如何卸载

```bash
npx skills remove <skill-name> -g          # 删除 skill
claude mcp remove <name>                    # 删除 MCP
claude plugin uninstall <plugin-name>        # 删除 plugin
claude plugin marketplace remove <name>      # 删除 marketplace
```

---

## 完整流水线效果

配置完成后，每次编码会话自动执行：

```
用户: "我要做一个用户导出功能"

Claude 自动:
  1. /brainstorming     ← 需求澄清
  2. /writing-plans     ← 制定计划
  3. Context7 MCP       ← 查 Excel 导出库最新 API
  4. /test-driven-development ← 先写测试
  5. code-simplifier    ← 写完自动精简
  6. /requesting-code-review ← 多代理审查
  7. Playwright MCP     ← 验证 UI 截图
  8. /verification-before-completion ← 最终验证
  9. /caveman-commit    ← 规范提交
  10. claude-mem         ← 持久化记忆

无需任何手动 / 命令调用
```
