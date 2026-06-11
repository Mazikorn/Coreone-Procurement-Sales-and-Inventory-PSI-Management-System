# Codex CLI 使用指南

> **优先级**: P1 — 推荐使用，遵循以下规范

## 可用命令

Codex CLI 通过 `codex:codex-rescue` 代理提供以下功能：

### 1. 对抗性审查（推荐）
```bash
codex adversarial-review [文件或目录]
```
- 对代码进行多角度审查，发现潜在漏洞
- 输出格式：CRITICAL / HIGH / MEDIUM / LOW 分级

### 2. 代码审查
```bash
codex review [文件或目录]
```
- 快速代码质量检查
- 关注：安全性、性能、可维护性

### 3. 任务执行
```bash
codex task [任务描述]
```
- 执行复杂的代码分析任务
- 支持多文件上下文

## 使用场景

| 场景 | 命令 | 说明 |
|------|------|------|
| 代码提交前审查 | `codex adversarial-review` | 全面安全检查 |
| PR 审查 | `codex review` | 快速质量检查 |
| 复杂 bug 分析 | `codex task` | 深度代码分析 |
| 架构评审 | `codex adversarial-review` | 多角度验证 |

## 注意事项

1. **Windows 环境**：确保工作路径不含特殊字符（如中文），必要时使用 symlink
2. **超时设置**：复杂任务可能需要较长时间，建议设置合理的超时
3. **结果验证**：Codex 输出需要人工验证，不要盲目采纳
4. **结合使用**：可与 Claude Agent 子代理配合，获得更全面的分析

## 禁用场景

以下情况**不建议**使用 Codex CLI：
- 简单的代码修改（直接使用 Claude Code）
- 实时交互式开发（响应较慢）
- 需要快速迭代的调试场景

---

*生效范围：所有 COREONE 项目会话。*
