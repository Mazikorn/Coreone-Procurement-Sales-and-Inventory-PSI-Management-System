# QA 审查复核报告 — Wave 1 High 问题

## 基本信息
| 属性 | 内容 |
|------|------|
| **审查日期** | 2026-06-02 |
| **审查范围** | Wave 1 初查 18 个 High 问题 |
| **复核方法** | 独立阅读源代码验证 |
| **复核文件** | outbound-v1.1.ts, inbound-v1.1.ts, outbound.test.ts, inbound.test.ts, outbound-flow.test.ts |

---

## 复核结果汇总

| 类别 | 初查数量 | ✅ 确认 | ❌ 误判 | ⚠️ 降级 |
|------|---------|---------|---------|---------|
| data-consistency | 5 | 5 | 0 | 0 |
| security | 5 | 0 | 2 | 3 |
| test-quality | 8 | 6 | 0 | 2 |
| **合计** | **18** | **11** | **2** | **5** |

**复核结论：18 个初查 High 中，11 个确认（61%），2 个误判（11%），5 个降级（28%）。**

---

## 逐条复核详情

### A. data-consistency 类（5/5 确认）

#### 1. outbound before_stock 在库存更新后读取 ✅ 确认

**位置**：`outbound-v1.1.ts:194`

**代码证据**：
```typescript
// line 172: 先更新库存
db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(alloc.quantity, ia.materialId)
// line 194: 再读 beforeStock — 此时 stock 已被扣减！
const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(ia.materialId) as any)?.stock || 0
const afterStock = beforeStock - alloc.quantity
```

**影响**：stock_logs 中的 before_stock 和 after_stock 都是错误的。如果原始库存 100，出库 10，正确应记录 before=100 after=90，实际记录 before=90 after=80。

---

#### 2. outbound POST 时 operator 从 body 读取可被伪造 ✅ 确认

**位置**：`outbound-v1.1.ts:117,160`

**代码证据**：
```typescript
const operator = req.body.operator || 'system'  // line 117
// ... line 160: 直接使用 operator
```

**影响**：任何登录用户可以伪造 operator 字段冒充他人操作。

---

#### 3. inbound POST 时 operator 从 body 读取可被伪造 ✅ 确认

**位置**：`inbound-v1.1.ts:184`

**代码证据**：
```typescript
const operator = req.body.operator || 'system'  // line 184
```

**影响**：同上。

---

#### 4. outbound DELETE 时 operator 从 body 读取 ✅ 确认

**位置**：`outbound-v1.1.ts:522`

**代码证据**：
```typescript
.run(logId, item.material_id, item.quantity, before, after, id, req.body.operator || 'system')
```

**影响**：同上。

---

#### 5. inbound PUT→cancelled 时取消原因丢失 ✅ 确认

**位置**：`inbound-v1.1.ts:292-343` vs `inbound-v1.1.ts:610`

**代码证据**：
- PUT 路由处理 completed→cancelled 时（line 292-343），不读取 `reason` 字段
- POST `/:id/cancel` 路由（line 610）会保存 `cancel_reason`
- 两个入口行为不一致

**影响**：通过 PUT 直接改状态为 cancelled，取消原因会丢失，无法追溯。

---

### B. security 类（0 确认，2 误判，3 降级）

#### 6. outbound PUT/DELETE 权限检查不一致 ⚠️ 降级为 Medium

**位置**：`outbound-v1.1.ts:362-369`

**分析**：PUT/DELETE 使用 `requireWriteAccess`（admin + warehouse_manager），POST 使用 app.ts 全局中间件（admin + warehouse_manager + technician + pathologist）。这不是安全漏洞，是业务设计（创建比修改权限更宽松）。

---

#### 7. outbound GET /:id 不存在 ❌ 误判

**分析**：这不是安全问题。列表接口已返回完整数据（line 76-88 包含 items 详情），只是没有单独的详情 API，属于功能缺失。

---

#### 8. inbound GET / 无认证 ❌ 误判

**分析**：同 Critical 复核结论，app.ts 已全局挂载 authenticateToken。

---

#### 9. 错误信息泄露内部细节 ⚠️ 降级为 Medium

**位置**：所有路由的 `catch (err: any) { error(res, err.message) }`

**分析**：SQLite 错误消息可能包含表名/列名。但当前环境是内部管理系统，非公网暴露，风险较低。

---

#### 10. operator 伪造归入 data-consistency 类

已确认，见上面 #2/#3/#4。

---

### C. test-quality 类（6 确认，0 误判，2 降级）

#### 11. outbound.test.ts 断言过于宽松 ✅ 确认

**位置**：`outbound.test.ts:26-35`

**代码证据**：
```typescript
assertTrue(res.success, 'success')
assertTrue(res.data.outboundNo, 'has outboundNo')
assertTrue(res.data.outboundNo.startsWith('OB-'), 'starts with OB-')
// 未验证: totalCost, status, items 数量, 库存变化
```

**影响**：测试只验证"创建成功"，不验证核心业务逻辑（成本计算、库存扣减）。

---

#### 12. inbound.test.ts 缺少业务逻辑测试 ✅ 确认

**位置**：`inbound.test.ts` 全文

**分析**：只有 10 个测试用例，全部是 happy path + 参数校验。缺少 amount 计算、批次创建、库存变化、采购订单更新等验证。

---

#### 13. integration/outbound-flow.test.ts ⚠️ 降级为 Medium

**分析**：这个测试实际上写得不错，有严格断言验证成本计算（`toBe(10*100+15*120)`）和库存变化。但缺少负库存边界和并发测试。

---

#### 14-15. 预警检查失败静默吞异常 ✅ 确认

**位置**：`outbound-v1.1.ts:27`，`inbound-v1.1.ts:39`

**代码证据**：
```typescript
} catch (_e) { /* 预警检查失败不影响主流程 */ }
```

**分析**：虽然"不阻断主流程"的设计意图合理，但完全没有日志记录会导致问题难以排查。

---

#### 16-18. 其余 test-quality 问题 ✅ 确认 / ⚠️ 降级

- E2E 测试 waitForTimeout 无断言 ✅ 确认
- bom 测试覆盖不全 ✅ 确认
- 其余问题降级为 Medium/Low（实际影响较小）

---

## 复核结论

**18 个初查 High 中，11 个确认（61%），2 个误判（11%），5 个降级（28%）。**

### 确认问题优先级排序

| 优先级 | 问题 | 影响 |
|--------|------|------|
| **P1** | before_stock 在更新后读取 | 日志数据全部错误，历史追溯失效 |
| **P1** | operator 从 body 读取（3处） | 操作审计不可信 |
| **P1** | PUT→cancelled 取消原因丢失 | 业务追溯断裂 |
| **P2** | 测试断言过于宽松（2处） | 代码变更无有效保护 |
| **P2** | 预警检查静默吞异常（2处） | 问题排查困难 |
| **P3** | E2E/bom 测试覆盖不全 | 回归风险 |

### 误判根因（与 Critical 复核一致）

1. 未检查 app.ts 全局路由注册
2. 功能缺失 ≠ 安全问题

---

## Wave 1 总体复核统计

| 严重度 | 初查数量 | 确认 | 误判 | 降级 | 确认率 |
|--------|---------|------|------|------|--------|
| Critical | 5 | 1 | 3 | 1 | 20% |
| High | 18 | 11 | 2 | 5 | 61% |
| Medium | 31 | — | — | — | 待复核 |
| Low | 16 | — | — | — | 待复核 |
| **合计** | **70** | **12** | **5** | **6** | — |

**关键发现**：Critical 级别误判率高达 80%，High 级别误判率 11%。说明初查在"安全敏感"问题上容易过度警报，但在"数据一致性"和"测试质量"问题上判断较准确。
