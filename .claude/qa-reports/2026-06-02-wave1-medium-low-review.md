# QA 审查复核报告 — Wave 1 Medium/Low 问题

## 基本信息
| 属性 | 内容 |
|------|------|
| **审查日期** | 2026-06-02 |
| **审查范围** | Wave 1 初查 31 Medium + 16 Low = 47 个问题 |
| **复核方法** | 基于已读取源码批量分析 |
| **复核文件** | outbound.spec.ts, inbound.test.ts, outbound-flow.test.ts, cost-calculator.test.ts, bom-v1.1.ts, inventory-v1.1.ts |

---

## 复核结果汇总

| 类别 | 初查 | ✅ 确认 | ❌ 误判 | ⚠️ 降级 |
|------|------|---------|---------|---------|
| Medium | 31 | 22 | 0 | 9 |
| Low | 16 | 14 | 0 | 2 |
| **合计** | **47** | **36** | **0** | **11** |

---

## Medium 问题复核（12 类）

### M-1. E2E 二选一断言 ✅ 确认

**位置**：`outbound.spec.ts` — 约 30 个测试

```typescript
expect([201, 422]).toContain(res.status)
```

**影响**：测试不区分"出库成功"和"库存不足"。如果出库逻辑出 bug 返回了 201（应该 422），测试仍通过。

---

### M-2. E2E 无断言测试 ✅ 确认

**位置**：`outbound.spec.ts` — 约 15 个测试

```typescript
test('OUT-LIST-02. 空数据边界', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto(`${FE_BASE}/outbound`)
  await page.waitForTimeout(800)
  // 无任何断言
})
```

**影响**：这些测试永远不会失败，是"假测试"。

---

### M-3. bom POST 无事务包裹 ✅ 确认

**位置**：`bom-v1.1.ts:142-201`

POST 路由执行 INSERT boms + 多个 INSERT 子表，无 BEGIN/COMMIT/ROLLBACK。与已确认的 Critical 问题（PUT 无事务）是同一模式。

---

### M-4. bom PUT 校验失败无回滚 ✅ 确认

**位置**：`bom-v1.1.ts:220-231`

```typescript
db.prepare('DELETE FROM bom_items WHERE bom_id = ?').run(id)  // 已删除
for (const m of materials) {
  if (isNaN(usage) || usage < 0) {
    error(res, 'Invalid usage_per_sample', 'INVALID_PARAMETER', 400); return
    // 没有 ROLLBACK！DELETE 已执行
  }
}
```

**影响**：DELETE 成功后如果 INSERT 校验失败，BOM 将处于无物料状态。

---

### M-5. inbound PUT 不更新 amount ✅ 确认

**位置**：`inbound-v1.1.ts:271-280`

修改 price 或 quantity 时，`amount` 字段不会更新，导致金额不一致。

---

### M-6. inventory 隐式过滤 stock > 0 ✅ 确认

**位置**：`inventory-v1.1.ts:24`

```typescript
let where = "m.is_deleted = 0 AND i.stock > 0"
```

零库存物料不出现，API 文档未说明。

---

### M-7. quantity=0/-1 接受 201 ⚠️ 降级为 Low

**位置**：`outbound.spec.ts:361-379`

后端代码 `outbound-v1.1.ts:138` 已校验 `Number(quantity) <= 0` 返回 400，201 不会发生。

---

### M-8. E2E cleanup 空 catch ✅ 确认

**位置**：`outbound.spec.ts:79`

---

### M-9. bom POST 空物料数组 ⚠️ 降级为 Low

可能是业务允许的（后续编辑添加物料）。

---

### M-10. Mock 数据库测试 ✅ 确认

**位置**：`cost-calculator.test.ts:13-66`

---

### M-11. 路由 catch 无日志 ✅ 确认

所有路由文件的 catch 块都无 `console.error`。

---

### M-12. outbound PUT 返回值一致 ⚠️ 降级为 Low

实际一致，无需修改。

---

## Low 问题复核（8 类）

### L-1. 硬编码凭证 ✅ 确认

**位置**：`outbound.spec.ts:6-13`

### L-2. 魔法数字 ✅ 确认

**位置**：`outbound.spec.ts` 全文

### L-3. bom 只允许 admin ✅ 确认

**位置**：`bom-v1.1.ts:8`

### L-4. pageSize 上限 200 ✅ 确认

**位置**：`inventory-v1.1.ts:21`

### L-5. 测试无注释 ✅ 确认

### L-6. 空 catch ✅ 确认（已在 High 中）

### L-7. waitForTimeout 硬编码 ✅ 确认

### L-8. bom POST 空物料 ⚠️ 降级（同 M-9）

---

## Wave 1 总体复核统计

| 严重度 | 初查 | 确认 | 误判 | 降级 | 确认率 |
|--------|------|------|------|------|--------|
| Critical | 5 | 1 | 3 | 1 | 20% |
| High | 18 | 11 | 2 | 5 | 61% |
| Medium | 31 | 22 | 0 | 9 | 71% |
| Low | 16 | 14 | 0 | 2 | 88% |
| **合计** | **70** | **48** | **5** | **17** | **69%** |

---

## 复核结论

**70 个初查问题中，48 个确认（69%），5 个误判（7%），17 个降级（24%）。**

### 误判根因分析

| 根因 | 次数 | 说明 |
|------|------|------|
| 未看 app.ts 全局注册 | 2 | 初查员只看路由文件内部 |
| 误读参数化查询 | 1 | 将 `params.push()` 误判为字符串拼接 |
| 描述不准确 | 1 | 问题存在但初查描述有误 |
| 功能缺失 ≠ 安全问题 | 1 | GET /:id 不存在是功能缺失 |

### 确认问题按优先级排序

| 优先级 | 问题 | 数量 |
|--------|------|------|
| **P1** | bom 无事务包裹（POST + PUT） | 2 |
| **P1** | before_stock 错误 | 1 |
| **P1** | operator 伪造 | 3 |
| **P1** | 取消原因丢失 | 1 |
| **P1** | inbound PUT 不更新 amount | 1 |
| **P2** | bom PUT 校验失败无回滚 | 1 |
| **P2** | E2E 测试质量差 | ~45 |
| **P2** | 路由 catch 无日志 | 全部 |
| **P3** | 代码风格 / 魔法数字 | ~14 |
