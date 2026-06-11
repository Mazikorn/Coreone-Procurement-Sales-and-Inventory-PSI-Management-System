# 发现与决策 — COREONE 检测项目与 BOM 配置 & 成本核算修复

## 调研日期
2026-05-28

---

## 一、业务背景需求

### 用户确认的四项关键需求
1. **现有物料**：系统里已配置一抗、二抗等基础试剂物料
2. **PCR 套餐扩展**：计划开展 PCR 检测，一般为固定套餐（Panel 模式）
3. **多品牌替代**：同一种抗体会采购多个品牌/供应商
4. **分组成本统计**：希望看到 Panel 中各子项（如 MMR 的 MLH1/PMS2/MSH2/MSH6）的独立成本

### 系统核心定位
**成本核算和运营端管理**是系统的最核心功能，成本数据的准确性直接决定系统的业务价值。

---

## 二、行业调研结论

### 免疫组化收费体系
- 国家编码：**270500002**（免疫组织化学染色诊断）
- 计费方式：基础项目费 + 按抗体数量加收
- 单项抗体：200–2000 元/项
- 复杂 Panel（10+ 抗体）：3000–5000 元

### 临床 Panel 体系
| 层次 | 占比 | 示例 |
|------|------|------|
| 单一抗体检测 | 60-70% | Ki-67、CD20、HER2 |
| 固定 Panel 检测 | 20-30% | 乳腺癌四联（ER/PR/HER2/Ki-67）、MMR 四联检 |
| 阶梯式探索 Panel | 5-10% | 淋巴瘤分型动态追加 |

### 成本核算方法论
- 单张切片成本 = Σ(各物料用量 × 物料单价) + 分摊成本
- 三级仓库体系（医院总库 → 病理科库 → 工作组分库）
- SPD 供应链管理模式

---

## 三、代码走读发现 — 功能性问题

### 3.1 项目创建时 BOM 关联不生效（严重 BUG）

**代码位置**：
- `ProjectCreateModal.tsx:163-209` —— 用户可以选择已有 BOM
- `useProjectsPage.ts:159-178` —— `handleSubmit` 调用 `projectApi.create(form)`
- `projects-v1.1.ts:66-84` —— POST 接口**不接收 `bom_id`**

**现象**：用户在"新建检测服务"第二步选了 BOM，点创建后项目成功创建，但 `bom_id` 是 NULL。

### 3.2 BOM 物料无法在线编辑（严重 BUG）

**代码位置**：
- `useBOMPage.ts:19-28` —— `BOMForm` 接口只有基本字段，**没有 `materials`**
- `BOMFormModal.tsx:157-223` —— 物料清单区域是**只读展示**
- `useBOMPage.ts:241-259` —— `handleSubmit` 只提交基本字段

**现象**：用户无法在界面上添加/删除/修改 BOM 的物料清单。

### 3.3 BOM 复制时物料 materialId 丢失（BUG）

**代码位置**：`useBOMPage.ts:294-307`

前端 `BOMMaterial` 的字段是 `id`，后端 `bom-v1.1.ts:83` 读取的是 `m.materialId`。字段名不一致导致复制时 materialId 为 undefined。

### 3.4 替代物料字段完全未使用

**代码位置**：
- `DatabaseManager.ts:144` —— `bom_items` 表已预留 `is_alternative`、`main_item_id`
- `bom-v1.1.ts:88-89, 123-124` —— INSERT 语句**完全没有这两个字段**
- `outbound-v1.1.ts` —— 出库逻辑**不处理替代选择**
- 前端所有组件 —— **不展示替代关系**

### 3.5 成本报表时间筛选不生效

**代码位置**：`useCostAnalysisPage.ts:62-80`

`fetchData` 调用 API 时没有传递 `startDate`/`endDate` 参数，导致时间筛选只在前端生效，后端始终返回全量数据。

---

## 四、代码走读发现 — 成本核算准确性问题（核心）

### 4.1 出库时单批次扣减导致负库存（🔴 严重）

**代码位置**：`outbound-v1.1.ts:110-117`（普通出库）和 `:230-240`（BOM 出库）

```typescript
const batch = db.prepare(`
  SELECT b.* FROM batches b
  WHERE b.material_id = ? AND b.remaining > 0 AND b.status = 1
  ORDER BY b.expiry_date ASC
`).get(materialId) as any           // ← .get() 只取第一条！
```

**问题**：只取最早过期的一个批次，但出库量可能超过该批次剩余量。

**扣减代码**：
```typescript
db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?')
  .run(oi.quantity, oi.batchId)
```

如果 `quantity > batch.remaining`，批次库存会变成**负数**。

**示例推演**：
- 批次 A（快过期）：remaining = 5ml，price = ¥100/ml
- 批次 B（后过期）：remaining = 50ml，price = ¥120/ml
- 出库 30ml

系统行为：取批次 A，`remaining = 5 - 30 = -25` ❌

### 4.2 多批次出库成本不加权分摊（🔴 严重）

接上面的例子：

| 计算方式 | 成本 |
|---------|------|
| 系统实际计算 | 30ml × ¥100 = **¥3,000** |
| 正确计算 | 5ml × ¥100 + 25ml × ¥120 = **¥3,500** |
| **偏差** | **-14.3%（系统性低估）** |

由于采用 FEFO（先过期先出），先入库的批次通常价格较低，系统会**系统性低估成本**。

### 4.3 库存总价值用物料当前价（🟡 中等）

**代码位置**：`inventory-v1.1.ts:148-153`

```typescript
SELECT SUM(i.stock * COALESCE(m.price, 0)) as v
FROM inventory i
JOIN materials m ON i.material_id = m.id
```

用的是 `materials.price`，不是按各批次的 `inbound_price` 加权。

**示例偏差**：
- 批次 A：100个 @ ¥100
- 批次 B：50个 @ ¥120
- `m.price` = ¥110

系统计算：150 × 110 = **¥16,500**  
实际价值：100×100 + 50×120 = **¥16,000**  
偏差：**+3.1%**

### 4.4 BOM 理论成本静态不更新（🟡 中等）

**代码位置**：`bom-v1.1.ts:56`

```typescript
const totalCost = materials.reduce((sum, m) => sum + (m.price || 0) * m.usagePerSample, 0)
```

BOM 的单样本理论成本在创建时计算，用的是当时的 `materials.price`。如果后续采购价格变化，**理论成本不会自动更新**，导致对账时的"理论 vs 实际"对比失真。

### 4.5 退库无成本冲减（🟡 中等）

**代码位置**：`returns-v1.1.ts:44-62`

退库只记录了数量和原因，**没有记录退库的物料成本**。成本报表里出库成本包含这批物料，但退库没有冲减对应成本，导致**成本高估**。

### 4.6 退货给供应商无批次关联（🟡 中等）

**代码位置**：`supplier-returns-v1.1.ts:147-150`

```typescript
VALUES (..., null, null, ...)  // batch_id 和 batch_no 都是 null
```

创建退货记录时批次信息为 null：
- 无法追溯退货的是哪个批次
- `refund_amount` 是用户手动填写，不是系统自动计算的成本
- 退货成本与出库成本无法对冲

---

## 五、技术决策

| 决策 | 理由 |
|------|------|
| 保持 project → bom 一对一关系 | 多对多会带来出库操作复杂、成本分摊模糊、库存支撑计算困难等问题 |
| BOM 内增加 `group_name` 字段实现 Panel 分组 | 最小改动，不影响现有逻辑，支持分组成本统计 |
| 采用 FEFO 批次分配 + 加权成本计算 | 符合试剂管理行业惯例（先过期先用），同时确保成本准确 |
| 替代物料采用"BOM 内替代"模式 | 出库时自动选有库存的替代品牌，保留历史成本追溯 |
| BOM 理论成本采用"动态实时计算" | 避免静态值滞后，确保对账基准准确 |
| 不单独为 PCR 建表 | PCR 固定套餐与 IHC Panel 本质相同，复用现有 project + bom 模型 |

---

## 六、风险与注意事项

| 风险 | 缓解措施 |
|------|---------|
| 多批次分配逻辑改动影响现有出库流程 | 保持原有接口不变，只改内部批次分配算法；增加单元测试覆盖 |
| 成本计算变化影响历史报表 | 历史出库记录已保存 `unit_cost`，不受影响；只有新出库用新逻辑 |
| 替代物料自动选择可能导致"跳品牌" | 增加配置项：是否允许自动替代；默认允许，可关闭 |
| 数据库迁移兼容性 | 使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS`；SQLite 兼容处理 |

---

---

## 七、PM-QA-001 成本分析页面质量审查（2026-06-02）

### 7.1 VibeContract 重建

基于现有代码重建的成本分析功能契约：
- 数据契约：materialCost/laborCost/equipmentCost/qcCost/indirectCost/totalCost/unitCost
- 边界契约：样本数为0、无BOM、设备capacity为0、残值=原值、退库扣减
- 异常契约：403无权限、400日期错误、500数据库超时

### 7.2 发现的问题

| # | 问题 | 位置 | 严重度 | 说明 |
|---|------|------|--------|------|
| QA-001 | 测试使用 Mock 数据库 | `cost-calculator.test.ts` | 🔴 高 | `createMockDb` 函数基于字符串匹配返回假数据，未测真实交互 |
| QA-002 | 占比计算可能超100% | `reports-v1.1.ts:36-37` | 🔴 高 | toFixed(1) 四舍五入累加后可能超过100%，测试断言容忍到105% |
| QA-003 | E2E 断言过于宽松 | `cost-analysis.spec.ts` 多处 | 🟡 中 | 大量 `toBeVisible()` 只验证元素存在，未验证内容和数量 |
| QA-004 | 错误处理静默吞异常 | `reports-v1.1.ts` 所有路由 | 🟡 中 | try-catch 只返回 error message，无日志记录和错误分类 |
| QA-005 | 复杂路由无直接测试 | `full-cost-by-project` | 🔴 高 | 200+行逻辑无 API 级别测试，仅通过 E2E 间接覆盖 |
| QA-006 | 精度累积误差 | `cost-calculator.ts:24` | 🟡 中 | 多次 Math.round 累加后可能出现 0.01 级误差 |
| QA-007 | 日期拼接无校验 | `reports-v1.1.ts:15` | 🟡 中 | `${endDate}T23:59:59` 如果 endDate 含时间部分会生成非法日期 |

### 7.3 测试质量评分

| 维度 | 得分 | 说明 |
|------|------|------|
| Happy Path 覆盖 | 85/100 | 正常流程测试较全 |
| 边界条件覆盖 | 45/100 | 缺少并发、大数据量、异常数据 |
| 断言严格性 | 50/100 | 大量宽松断言 |
| 集成测试 | 30/100 | 几乎全部使用 Mock |
| 安全测试 | 60/100 | 有权限测试但不够完整 |
| **总分** | **54/100** | **需要改进** |

---

---

## 八、PM-QA-001 Wave 1 全功能审查结果（2026-06-02）

### 8.1 审查范围

使用 `/pm-qa-001` 框架对 5 个 P0 核心模块进行并行质量审查。

| 模块 | 风险评分 | 测试评分 | 发现问题 |
|------|---------|---------|---------|
| **inbound** | 72 | 62 | 15 |
| **outbound** | 62 | 55 | 16 |
| **inventory** | 68 | 45 | 15 |
| **bom** | 68 | 42 | 14 |
| **cost-analysis** | 72 | 55 | 10 |
| **合计** | — | — | **70** |

### 8.2 问题分布

| 严重度 | 数量 | 占比 |
|--------|------|------|
| 🔴 Critical | 5 | 7% |
| 🟠 High | 18 | 26% |
| 🟡 Medium | 31 | 44% |
| 🟢 Low | 16 | 23% |

### 8.3 Critical 问题清单（必须立即修复）

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| QA-003 | inbound | amount 计算缺少类型校验，price=0 与未填写无法区分 | `inbound-v1.1.ts:190` |
| QA-002 | bom | PUT 更新 BOM 时 DELETE+INSERT 无事务包裹 | `bom-v1.1.ts:204-271` |

### 8.3b Critical 复核结果（2026-06-02）

**复核方法**：独立阅读源代码，验证初查结论

| 初查 ID | 模块 | 初查结论 | 复核判定 | 复核说明 |
|---------|------|---------|---------|------|
| QA-003 | inbound | price 字符串导致意外结果 | ⚠️ 降级为 High | `"5.5" * qty` 在 JS 中实际安全；真正问题是缺少类型校验 + 免费场景无法区分 |
| QA-003 | outbound | GET /outbound 缺少权限检查 | ❌ 误判 | `app.ts:75` 已全局挂载 `authenticateToken` + `requireRole` |
| QA-001 | inventory | keyword SQL 注入 | ❌ 误判 | 实际使用参数化查询（`params.push()` + `?` 占位符） |
| QA-001 | bom | GET /boms 无认证 | ❌ 误判 | `app.ts:85` 已全局挂载 `authenticateToken` + `requireRole` |
| QA-002 | bom | PUT 无事务包裹 | ✅ 确认 | 5 组 DELETE+INSERT 确实无 BEGIN/COMMIT |

**复核统计**：5 个初查 Critical → 1 个确认（20%）、3 个误判（60%）、1 个降级（20%）

**误判根因**：
1. 未检查 `app.ts` 全局路由注册（2 次）
2. 误将参数化查询理解为字符串拼接（1 次）
3. 类型安全问题描述不准确（1 次）

### 8.4b High 复核结果（2026-06-02）

**复核方法**：独立阅读源代码（outbound-v1.1.ts、inbound-v1.1.ts、outbound.test.ts、inbound.test.ts、outbound-flow.test.ts）

| 类别 | 初查数量 | 确认 | 误判 | 降级 |
|------|---------|------|------|------|
| data-consistency | 5 | 5 | 0 | 0 |
| security | 5 | 0 | 2 | 3 |
| test-quality | 8 | 6 | 0 | 2 |
| **合计** | **18** | **11** | **2** | **5** |

**确认的 High 问题（11 个）**：

| # | 模块 | 问题 | 位置 |
|---|------|------|------|
| 1 | outbound | before_stock 在更新后读取，日志数据错误 | `outbound-v1.1.ts:194` |
| 2 | outbound | operator 从 body 读取可被伪造 | `outbound-v1.1.ts:475` |
| 3 | inbound | operator 从 body 读取可被伪造 | `inbound-v1.1.ts:429` |
| 4 | outbound | DELETE 时 operator 从 body 读取 | `outbound-v1.1.ts:522` |
| 5 | inbound | PUT→cancelled 时取消原因丢失 | `inbound-v1.1.ts:263-441` |
| 6 | outbound | 测试断言过于宽松，不验证核心逻辑 | `outbound.test.ts` |
| 7 | inbound | 测试缺少业务逻辑验证 | `inbound.test.ts` |
| 8 | outbound | 预警检查失败静默吞异常 | `outbound-v1.1.ts:27` |
| 9 | inbound | 预警检查失败静默吞异常 | `inbound-v1.1.ts:39` |
| 10 | outbound | E2E 测试 waitForTimeout 无断言 | E2E tests |
| 11 | bom | 测试覆盖不全，缺少边界条件 | bom tests |

**误判（2 个）**：outbound GET / 无认证（app.ts 已挂载）、outbound GET /:id 不存在（功能缺失非安全）

**降级（5 个）**：PUT/DELETE 权限更严格（合理设计）、错误信息泄露（内网风险低）、集成测试质量比预期好、其余 test-quality 问题影响较小

### 8.5b Medium/Low 复核结果（2026-06-02）

**复核方法**：基于已读取源码批量分析

| 类别 | 初查 | 确认 | 误判 | 降级 |
|------|------|------|------|------|
| Medium | 31 | 22 | 0 | 9 |
| Low | 16 | 14 | 0 | 2 |

**确认的 Medium 问题（12 类）**：
1. E2E 二选一断言 `expect([201, 422]).toContain(res.status)` — ~30 个测试
2. E2E 无断言测试（waitForTimeout 后无验证）— ~15 个测试
3. bom POST 路由同样缺少事务包裹 — `bom-v1.1.ts:142-201`
4. bom PUT 校验失败时 DELETE 已执行无回滚 — `bom-v1.1.ts:220-231`
5. inbound PUT 不更新 amount 字段 — `inbound-v1.1.ts:271-280`
6. inventory 隐式过滤 stock > 0 — `inventory-v1.1.ts:24`
7. cost-calculator Mock 数据库测试 — `cost-calculator.test.ts:13-66`
8. 所有路由 catch 块无日志记录
9. E2E cleanup 空 catch — `outbound.spec.ts:79`
10. bom POST 空物料数组创建空 BOM
11. outbound PUT 返回值字段名一致（降级）
12. E2E quantity 边界后端已防护（降级）

**确认的 Low 问题（8 类）**：硬编码凭证、魔法数字、bom 只允许 admin、pageSize 上限 200、测试无注释、空 catch（已在 High 确认）、waitForTimeout 硬编码

**Wave 1 总体复核统计**：
| 严重度 | 初查 | 确认 | 误判 | 降级 | 确认率 |
|--------|------|------|------|------|--------|
| Critical | 5 | 1 | 3 | 1 | 20% |
| High | 18 | 11 | 2 | 5 | 61% |
| Medium | 31 | 22 | 0 | 9 | 71% |
| Low | 16 | 14 | 0 | 2 | 88% |
| **合计** | **70** | **48** | **5** | **17** | **69%** |

---

## 九、PM-QA-001 Wave 2 审查结果（2026-06-02）

### 9.1 审查范围

使用 `/pm-qa-001` 框架对 11 个 P1 重要模块进行质量审查。

| 模块 | 文件 | 发现问题 |
|------|------|---------|
| purchase-orders | purchase-orders-v1.1.ts | 2 |
| alerts | alerts-v1.1.ts | 3 |
| returns | returns-v1.1.ts | 2 |
| reconciliation | reconciliation-v1.1.ts | 4 |
| supplier-returns | supplier-returns-v1.1.ts | 1 |
| equipment | equipment-v1.1.ts | 3 |
| labor-time | labor-time-v1.1.ts | 2 |
| indirect-cost | indirect-cost-v1.1.ts | 2 |
| stocktaking | stocktaking-v1.1.ts | 1 |
| scraps | scraps-v1.1.ts | 2 |
| transfers | transfers-v1.1.ts | 3 |
| **合计** | — | **20** |

### 9.2 问题分布

| 严重度 | 数量 | 占比 |
|--------|------|------|
| 🔴 Critical | 1 | 5% |
| 🟠 High | 3 | 15% |
| 🟡 Medium | 10 | 50% |
| 🟢 Low | 6 | 30% |

### 9.3 Critical 问题（必须立即修复）

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W2-01 | transfers | 调拨只创建入库记录，不扣减来源库位库存，导致总库存虚增 | `transfers-v1.1.ts:57-77` |

### 9.4 High 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W2-02 | reconciliation | cases/import 批量导入无事务包裹 | `reconciliation-v1.1.ts:323-362` |
| W2-03 | equipment | 硬 DELETE 不检查使用记录，产生孤儿数据 | `equipment-v1.1.ts:166-174` |
| W2-04 | transfers | unit 硬编码为 '个'，不使用物料单位 | `transfers-v1.1.ts:59` |

### 9.5 Medium 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W2-05 | 全部 | operator 从 body 读取可被伪造（7处） | 多文件 |
| W2-06 | reconciliation | logs POST 未校验 newUsage 值 | `reconciliation-v1.1.ts:426-432` |
| W2-07 | reconciliation | cases 列表 N+1 查询 | `reconciliation-v1.1.ts:305` |
| W2-08 | alerts | POST /:id/handle 无角色检查 | `alerts-v1.1.ts:77` |
| W2-09 | alerts | /generate 无限流保护 | `alerts-v1.1.ts:91` |
| W2-10 | equipment | calculateDepreciation 除零风险 | `equipment-v1.1.ts:25` |
| W2-11 | scraps | 报废不跟踪批次 | `scraps-v1.1.ts:30-71` |
| W2-12 | labor-time | 无角色检查，任何用户可修改成本定义 | `labor-time-v1.1.ts` |
| W2-13 | indirect-cost | 无角色检查，任何用户可修改成本定义 | `indirect-cost-v1.1.ts` |
| W2-14 | returns | findRecentOutboundItem 不检查 is_deleted | `returns-v1.1.ts:28` |

### 9.6 Low 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W2-15 | 全部 | 路由 catch 块无日志记录 | 全部 |
| W2-16 | purchase-orders | generateOrderNo 并发碰撞风险 | `purchase-orders-v1.1.ts:10-13` |
| W2-17 | alerts | 角色检查方式不一致 | `alerts-v1.1.ts:25` |
| W2-18 | labor-time | standardMinutes 允许负值 | `labor-time-v1.1.ts:111` |
| W2-19 | indirect-cost | monthlyAmount 允许负值 | `indirect-cost-v1.1.ts:89` |
| W2-20 | 全部 | 路由文件不自包含权限检查 | 全部 |

---

## 十、PM-QA-001 Wave 3 审查结果（2026-06-02）

### 10.1 审查范围

使用 `/pm-qa-001` 框架对 8 个 P2 基础模块进行质量审查。

| 模块 | 文件 | 发现问题 |
|------|------|---------|
| categories | categories-v1.1.ts | 3 |
| locations | locations-v1.1.ts | 2 |
| projects | projects-v1.1.ts | 3 |
| roles | roles-v1.1.ts | 2 |
| users | users-v1.1.ts | 2 |
| suppliers | suppliers-v1.1.ts | 2 |
| logs | logs-v1.1.ts | 1 |
| depletion | depletion-v1.1.ts | 4 |
| **合计** | — | **16** |

### 10.2 问题分布

| 严重度 | 数量 | 占比 |
|--------|------|------|
| 🔴 Critical | 0 | 0% |
| 🟠 High | 3 | 19% |
| 🟡 Medium | 8 | 50% |
| 🟢 Low | 5 | 31% |

### 10.3 High 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W3-01 | roles | 无角色检查，任何用户可修改角色定义 | `roles-v1.1.ts` |
| W3-02 | users | 无角色检查，任何用户可创建/删除用户 | `users-v1.1.ts` |
| W3-03 | depletion | deplete 操作无事务包裹 | `depletion-v1.1.ts:73-125` |

### 10.4 Medium 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W3-04 | categories | delete 无事务（迁移物料+更新子分类+软删除） | `categories-v1.1.ts:168-210` |
| W3-05 | categories | tree 端点 N+1 查询 | `categories-v1.1.ts:33` |
| W3-06 | locations | cascadeUpdate 无事务 | `locations-v1.1.ts:112-114` |
| W3-07 | projects | delete 不检查关联出库记录 | `projects-v1.1.ts:113-122` |
| W3-08 | projects | POST 不校验 bomId 是否存在 | `projects-v1.1.ts:72` |
| W3-09 | suppliers | rating/all 批量更新无事务 | `suppliers-v1.1.ts:134-146` |
| W3-10 | depletion | 无角色检查，任何用户可操作耗尽 | `depletion-v1.1.ts` |
| W3-11 | depletion | operator 从 body 读取 | `depletion-v1.1.ts:77` |

### 10.5 Low 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W3-12 | 全部 | 路由文件不自包含权限检查（6处） | 多文件 |
| W3-13 | categories | generateCategoryCode NaN 风险 | `categories-v1.1.ts:86` |
| W3-14 | locations | cascadeUpdate 无深度限制 | `locations-v1.1.ts:67-74` |
| W3-15 | suppliers | 评级算法魔法数字 | `suppliers-v1.1.ts:108-110` |
| W3-16 | 全部 | 路由 catch 块无日志记录 | 全部 |

---

## 十一、PM-QA-001 Wave 4 审查结果（2026-06-02）

### 11.1 审查范围

基础设施层：materials.ts, auth.ts, reports-v1.1.ts, middleware/auth.ts, DatabaseManager.ts, app.ts

### 11.2 问题分布

| 严重度 | 数量 | 占比 |
|--------|------|------|
| 🔴 Critical | 0 | 0% |
| 🟠 High | 3 | 21% |
| 🟡 Medium | 7 | 50% |
| 🟢 Low | 4 | 29% |

### 11.3 High 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W4-01 | auth | 软删除用户登录时自动恢复（安全风险） | `auth.ts:23-31` |
| W4-02 | auth | 登录无限流保护（暴力破解风险） | `auth.ts:11` |
| W4-03 | materials | `/next-code` 路由重复定义 | `materials.ts:56-64` + `121-129` |

### 11.4 Medium 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W4-04 | auth | refreshToken 注销时不失效 | `auth.ts:102-104` |
| W4-05 | auth | 登录返回硬编码权限，不区分角色 | `auth.ts:60` |
| W4-06 | middleware | pathToPermission 缺失部分路径映射 | `middleware/auth.ts:35-57` |
| W4-07 | materials | POST 创建物料+库存无事务 | `materials.ts:150-157` |
| W4-08 | materials | generateMaterialCode NaN 风险 | `materials.ts:110` |
| W4-09 | reports | ratio 返回 string 而非 number | `reports-v1.1.ts:36` |
| W4-10 | database | 未启用 PRAGMA foreign_keys | `DatabaseManager.ts` |

### 11.5 Low 问题

| ID | 模块 | 问题 | 位置 |
|----|------|------|------|
| W4-11 | reports | 路由文件不自包含权限检查 | `reports-v1.1.ts` |
| W4-12 | app.ts | 请求日志使用 console.log 而非结构化日志 | `app.ts:46` |
| W4-13 | database | 迁移逻辑 catch 静默吞异常 | `DatabaseManager.ts:63,103,112` |
| W4-14 | database | 硬编码测试用户密码 | `DatabaseManager.ts:481` |

### 11.6 全项目审查最终统计

| 严重度 | Wave 1 | Wave 2 | Wave 3 | Wave 4 | 合计 |
|--------|--------|--------|--------|--------|------|
| 🔴 Critical | 1 | 1 | 0 | 0 | **2** |
| 🟠 High | 11 | 3 | 3 | 3 | **20** |
| 🟡 Medium | 22 | 10 | 8 | 7 | **47** |
| 🟢 Low | 14 | 6 | 5 | 4 | **29** |
| **合计** | **48** | **20** | **16** | **14** | **98** |

### 10.6 Wave 1 + Wave 2 + Wave 3 总计

| 严重度 | Wave 1 确认 | Wave 2 发现 | Wave 3 发现 | 合计 |
|--------|------------|------------|------------|------|
| 🔴 Critical | 1 | 1 | 0 | **2** |
| 🟠 High | 11 | 3 | 3 | **17** |
| 🟡 Medium | 22 | 10 | 8 | **40** |
| 🟢 Low | 14 | 6 | 5 | **25** |
| **合计** | **48** | **20** | **16** | **84** |

### 9.7 Wave 1 + Wave 2 总计

| 严重度 | Wave 1 确认 | Wave 2 发现 | 合计 |
|--------|------------|------------|------|
| 🔴 Critical | 1 | 1 | **2** |
| 🟠 High | 11 | 3 | **14** |
| 🟡 Medium | 22 | 10 | **32** |
| 🟢 Low | 14 | 6 | **20** |
| **合计** | **48** | **20** | **68** |

### 8.4 High 问题分类汇总

| 类别 | 数量 | 典型问题 |
|------|------|---------|
| **test-quality** | 8 | 宽松断言（toBeDefined/toContain）、空 catch 块、无断言测试 |
| **data-consistency** | 5 | before_stock 在更新后读取、已出库批次允许修改、取消原因丢失 |
| **security** | 5 | 权限检查不一致、operator 从 body 读取可被伪造、错误信息泄露 |

### 8.5 共性问题模式

1. **测试断言过于宽松**：大量 `toBeDefined()`、`toContain([200, 400])`、`waitForTimeout()` 无断言
2. **错误静默处理**：catch 块为空或仅 `console.error`，无日志记录和监控
3. **权限检查不一致**：部分路由依赖 app.ts 全局配置，部分路由自身检查，存在绕过风险
4. **数据一致性隐患**：before_stock 在更新后读取、无事务包裹的多步操作、并发 ID 碰撞
5. **精度问题**：金额计算使用浮点数、多次四舍五入累加产生误差

### 8.6 测试质量总评分

| 模块 | Happy Path | 边界条件 | 断言严格性 | 集成测试 | 安全测试 | **总分** |
|------|-----------|---------|-----------|---------|---------|---------|
| inbound | 80 | 50 | 55 | 40 | 60 | **57** |
| outbound | 85 | 45 | 50 | 35 | 55 | **54** |
| inventory | 75 | 40 | 45 | 30 | 50 | **48** |
| bom | 80 | 35 | 40 | 25 | 45 | **45** |
| cost-analysis | 85 | 45 | 50 | 30 | 60 | **54** |
| **平均** | **81** | **43** | **48** | **32** | **54** | **51.6** |

---

*调研完成，进入修复实施阶段。详见 task_plan.md。*
