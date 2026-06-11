# 技能自动触发路由规则

> 本文件定义所有已安装技能的自动触发条件。Claude Code 应在匹配场景下**主动调用**对应技能（通过 Skill 工具），无需用户显式指定。

## 触发优先级

1. **P0 - 强制自动**：开发流程、代码质量、安全合规类技能，匹配时必须调用
2. **P1 - 智能推荐**：架构设计、项目管理类技能，匹配时建议调用
3. **P2 - 按需触发**：角色扮演、专业领域类技能，仅在用户暗示或明确需要时调用

---

## P0 - 强制自动触发（开发流程）

| 触发关键词/场景 | 调用的技能 | 说明 |
|----------------|-----------|------|
| "规划"、"plan"、"怎么实现"、"步骤" | `/writing-plans` + `/brainstorming` | 任何需要拆解任务的场景 |
| "测试"、"test"、"TDD"、"写测试" | `/test-driven-development` | 强制红绿重构流程 |
| "debug"、"bug"、"报错"、"不工作"、"fix" | `/systematic-debugging` | 系统化调试四步法 |
| "review"、"审查"、"看看代码"、"有问题吗" | `/requesting-code-review` | 代码审查 |
| "git worktree"、"分支"、"隔离开发" | `/using-git-worktrees` | 工作树管理 |
| "完成"、"done"、"好了"、"结束开发" | `/verification-before-completion` | 验证完成条件 |
| "子代理"、"subagent"、"并行" | `/dispatching-parallel-agents` + `/subagent-driven-development` | 子代理开发 |
| "执行计划"、"按步骤" | `/executing-plans` | 计划执行 |

## P0 - 强制自动触发（代码质量）

| 触发关键词/场景 | 调用的技能 | 说明 |
|----------------|-----------|------|
| "简化"、"重构"、"clean up"、"优化代码" | `/simplify` | 代码简化 |
| "commit"、"提交"、"git commit" | `/commit` + `/commit-and-push` | 提交规范 |
| "PR"、"pull request"、"合并请求" | `/create-pr` | 创建 PR |
| "E2E"、"playwright"、"端到端" | `/playwright-e2e-testing` | E2E 测试 |

## P1 - 智能推荐（技术领域）

| 触发关键词/场景 | 调用的技能 | 说明 |
|----------------|-----------|------|
| React、Next.js、前端组件 | `/vercel-react-best-practices` + `/frontend-development` | React 最佳实践 |
| API、后端、数据库、Express | `/backend-development` + `/api-design-reviewer` | 后端开发 |
| "部署"、"Vercel"、"上线" | `/deploy-to-vercel` + `/devops-cicd` | 部署流程 |
| "shadcn"、"组件库"、"UI" | `/shadcn` + `/ui-ux-designer` | UI 组件 |
| "数据库设计"、"schema"、"表结构" | `/database-schema-designer` + `/db-migration` | 数据库设计 |
| "安全"、"SQL注入"、"XSS"、"漏洞" | `/security-review` + `/ai-security` | 安全审查 |
| "性能"、"优化"、"慢"、"卡顿" | `/performance-profiler` + `/vercel-optimize` | 性能优化 |
| "Docker"、"K8s"、"容器" | `/docker-development` + `/kubernetes-operator` | 容器化 |
| "MCP"、"server"、"工具" | `/mcp-server-builder` | MCP 构建 |
| "RAG"、"向量"、"检索" | `/rag-architect` | RAG 架构 |

## P1 - 智能推荐（项目与产品）

| 触发关键词/场景 | 调用的技能 | 说明 |
|----------------|-----------|------|
| "PRD"、"需求文档"、"产品需求" | `/prd` + `/breakdown-feature-prd` | PRD 编写 |
| "敏捷"、"sprint"、"scrum"、"迭代" | `/agile-scrum` + `/scrum-master` | 敏捷流程 |
| "用户研究"、"调研"、"访谈" | `/user-research` + `/ux-researcher-designer` | 用户研究 |
| "QA"、"测试策略"、"质量" | `/qa-testing-strategy` | 测试策略 |
| "路线图"、"roadmap"、"里程碑" | `/roadmap-communicator` | 产品路线图 |

## P2 - 按需触发（专家角色）

以下技能**不自动触发**，仅在用户明确要求或上下文暗示时调用：

| 角色 | 技能 | 激活条件 |
|------|------|----------|
| 后端专家 | `/senior-backend` | 用户说"用专家视角"、"架构评审" |
| 前端专家 | `/senior-frontend` | 复杂前端架构决策 |
| 全栈专家 | `/senior-fullstack` | 跨端复杂功能 |
| DevOps专家 | `/senior-devops` | CI/CD、基础设施 |
| 安全专家 | `/senior-security` + `/ciso-advisor` | 安全审计、合规 |
| 产品经理 | `/product-manager-toolkit` + `/product-strategist` | 产品决策 |
| CTO顾问 | `/cto-advisor` + `/cto-review` | 技术战略 |
| 营销专家 | `/marketing-strategy-pmm` + `/seo-audit` | 营销策略 |
| 合规官 | `/gdpr-dsgvo-expert` + `/soc2-compliance` + `/iso42001-specialist` | 合规审查 |
| FDA顾问 | `/fda-consultant-specialist` + `/mdr-745-specialist` | 医疗器械合规 |

## P2 - 按需触发（工具与模式）

| 工具/模式 | 技能 | 激活条件 |
|----------|------|----------|
| Caveman精简模式 | `/caveman` | 用户说"精简"、"节省token"、"caveman" |
| 飞书文档 | `/create-feishu-doc` | 用户提到飞书、Lark |
| GitHub Issues | `/create-issues` + `/resolve-issues` |  issue 管理 |
| ACPX工作流 | `/use-acpx` | 用户提到 ACPX |
| 代码库迁移 | `/migration-architect` + `/migrate` | 迁移项目 |
|  monorepo | `/monorepo-navigator` | monorepo 结构 |
| Terraform | `/terraform-patterns` | 基础设施即代码 |
| Helm | `/helm-chart-builder` | K8s 部署 |

---

## 多技能组合调用规则

某些复杂场景需要**组合调用**多个技能：

### 新功能开发流程
```
用户: "开发新功能 X"
自动调用:
  1. /brainstorming          → 澄清需求
  2. /writing-plans          → 制定计划
  3. /test-driven-development → 测试先行
  4. /backend-development 或 /frontend-development → 技术实现
  5. /requesting-code-review → 代码审查
  6. /verification-before-completion → 验证
  7. /create-pr              → 创建 PR
```

### Bug 修复流程
```
用户: "修复 bug"
自动调用:
  1. /systematic-debugging   → 根因分析
  2. /test-driven-development → 写复现测试
  3. /focused-fix            → 精准修复
  4. /verification-before-completion → 验证
```

### 代码重构流程
```
用户: "重构这段代码"
自动调用:
  1. /simplify               → 代码简化
  2. /refactor               → 重构模式
  3. /requesting-code-review → 审查
  4. /test-driven-development → 确保测试通过
```

### 安全审查流程
```
用户: "审查安全性" 或涉及认证/授权/输入处理
自动调用:
  1. /security-review        → 安全审查
  2. /skill-security-auditor → 技能安全审计
  3. /senior-security        → 专家视角
```

### 产品规划流程
```
用户: "规划产品功能"
自动调用:
  1. /prd                    → 产品需求文档
  2. /breakdown-feature-prd  → 拆解 PRD
  3. /product-discovery      → 产品发现
  4. /agile-scrum            → 敏捷规划
```

---

## 记忆与上下文

- **跨会话记忆**: 使用项目 `.claude/memory/` 目录存储用户偏好和项目上下文
- **计划持久化**: 复杂计划写入 `.claude/plans/` 目录
- **技能调用记录**: 在 `session-log.md` 中记录调用的技能和结果

## 禁止行为

- **不堆叠技能**: 同一场景下不要同时调用超过 3 个技能
- **不重复调用**: 同一会话中同一技能不重复调用（除非用户明确要求）
- **不越级触发**: P2 技能不会自动触发，必须等待用户暗示或明确请求
- **保持上下文**: 调用技能时传递当前项目的 `coreone-conventions` 上下文

---

*本文件与 CLAUDE.md 和 coreone-guardrails.md 配套使用。如有冲突，以本文件的技能触发规则为准。*
