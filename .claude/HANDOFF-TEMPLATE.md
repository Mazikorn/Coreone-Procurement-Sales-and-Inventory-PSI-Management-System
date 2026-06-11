# 会话 Handoff 机制

> **用途**: 当连续对话过长时，通过 Handoff 文档实现上下文无损交接  
> **触发条件**: 以下任一情况出现时，当前 Agent 应建议用户开启新对话

---

## 触发条件

| # | 场景 | 说明 |
|:---|:---|:---|
| 1 | **任务完成** | 当前主要任务（如一批缺陷修复、CI 回归）已完成，需汇报成果 |
| 2 | **长时间等待** | 需要等待外部事件（如 CI 运行、构建完成）超过 30 分钟 |
| 3 | **上下文切换** | 用户要切换到完全不同的工作方向（如从 E2E 修复切换到新功能开发） |
| 4 | **对话轮数** | 已连续交互超过 20 轮，或累计 token 超过 50k |
| 5 | **复杂决策点** | 需要用户做出重大方向决策，且后续工作量大 |

---

## Handoff 流程

### Step 1: 创建 Handoff 文档

Agent 在建议 handoff 前，必须填写 `SESSION-A-HANDOFF-CURRENT.md`：

```markdown
---
session: A
agent: Roo
created: YYYY-MM-DD HH:MM
status: 进行中 / 已完成 / 等待中
---

## 当前任务
[一句话描述当前进行中的主要任务]

## 已完成成果
- [ ] 
- [ ]

## 待办事项（按优先级）
1. [ ] 
2. [ ]

## 关键上下文
- 相关 commit: 
- 相关 CI run: 
- 相关文件: 

## 已知问题 / 风险
- 

## 下一步建议
[用户开启新对话后，建议第一句话做什么]
```

### Step 2: 提交 Handoff 文档

```bash
git add .claude/SESSION-A-HANDOFF-CURRENT.md
git commit -m "docs: session handoff snapshot"
git push
```

### Step 3: 用户开启新对话

用户在新 Claude Code 会话中，第一句话：

```
我是会话A，请阅读 .claude/SESSION-A-HANDOFF-CURRENT.md 和 .claude/SESSION-A-WORKLOG.md 恢复上下文。
```

---

## 当前会话 Handoff 状态

见 `.claude/SESSION-A-HANDOFF-CURRENT.md`
