# 任务计划：COREONE 检测项目/BOM 配置修复与成本核算准确性提升

## 目标
修复所有阻塞性 BUG 和成本核算准确性缺陷，实现替代物料管理和 Panel 分组成本统计，确保系统成本数据可用于经营决策。

## 当前阶段
阶段 0 已完成（调研分析），准备进入阶段 1

---

## 各阶段详细计划

### 阶段 1：修复阻塞性 BUG（P0）
*目标：让系统的基础功能可以正常使用*

#### 1.1 修复项目创建时 BOM 关联不保存
- [x] 后端 `projects-v1.1.ts` POST/PUT 接收并写入 `bom_id`
- [x] 前端 `useProjectsPage.ts` FormData 增加 `bomId` 字段
- [x] 前端 `useProjectsPage.ts` handleSubmit 传递 bomId
- [x] 前端 `ProjectEditModal` 支持修改 BOM 关联
- **状态：** complete
- **验证：** 新建检测服务选择 BOM 后，数据库 projects.bom_id 有值

#### 1.2 修复 BOM 物料无法在线编辑
- [x] 后端 `bom-v1.1.ts` POST/PUT 完整接收物料数组（统一字段名 materialId）
- [x] 前端 `useBOMPage.ts` BOMForm 增加 `materials` 字段
- [x] 前端 `BOMFormModal.tsx` 增加可编辑物料表格（增删改）
- [x] 前端物料选择集成 SearchableSelect（搜索现有物料）
- [x] 前端实现物料行：物料选择 + 用量输入 + 单位 + 删除按钮
- **状态：** complete
- **验证：** 可以新建 BOM 并添加/删除物料，保存后数据库 bom_items 正确

#### 1.3 修复 BOM 复制时 materialId 丢失
- [x] 确认前端 `BOMMaterial.id` 与后端 `materialId` 的映射关系
- [x] 统一字段命名（`handleCopy` 和 `openEdit` 中做 `id` → `materialId` 映射转换）
- **状态：** complete
- **验证：** 复制 BOM 后新 BOM 的物料清单与原 BOM 一致

---

### 阶段 2：修复成本核算核心 BUG（P0）
*目标：确保出库成本计算准确，杜绝负库存*

#### 2.1 实现多批次出库分配（修复负库存）
- [x] 提取公共函数 `allocateBatches(materialId, totalQty)`
- [x] 逻辑：按 FEFO 遍历批次，逐批次扣减，直到满足总需求量
- [x] 如果总库存不足，提前报错（在事务内）
- [x] 返回分配结果数组：`[{ batchId, batchNo, quantity, unitCost }]`
- [x] 修改 `outbound-v1.1.ts` POST / 接口，使用新分配逻辑
- [x] 修改 `outbound-v1.1.ts` POST /bom 接口，使用新分配逻辑
- [x] 修改 `outbound-v1.1.ts` PUT /:id 接口，回退旧分配后重新分配
- **状态：** complete
- **验证：**
  - 批次 A（10个@100）+ 批次 B（20个@120），出库 25 个
  - 结果：批次 A remaining=0，批次 B remaining=5
  - 出库记录生成两条，成本分别为 10×100 和 15×120

#### 2.2 实现多批次成本加权分摊
- [x] 在 `allocateBatches` 中返回各批次 unitCost
- [x] `outbound_records.total_cost` = Σ(各批次分配量 × 批次单价)
- [x] 每条 `outbound_items` 记录保存各自的 `unit_cost` 和 `total_cost`
- [x] 修改出库修改（PUT）逻辑，回退旧分配后重新分配
- [x] 修改出库删除逻辑，正确回退各批次库存（原有逻辑已支持多行回退）
- **状态：** complete
- **验证：**
  - 加权成本与手工计算一致
  - 修改出库单后成本重新计算正确
  - 删除出库单后批次库存正确恢复

#### 2.3 修复库存总价值计算
- [x] 修改 `inventory-v1.1.ts` `/stats` 接口
- [x] 库存总价值改为按 `batches` 加权：`COALESCE(SUM(remaining × inbound_price), 0)`
- **状态：** complete
- **验证：** 同一物料多批次不同价格时，总价值与手工计算一致

---

### 阶段 3：功能增强（P1）
*目标：实现品牌池替代和 Panel 分组成本统计*

#### 设计依据
- 见 `design-rationale-phase3.md`
- 核心决策："已准入品牌池"替代"主/替层级"；`group_name` 实现 Panel 分组

#### 3.1 数据库迁移
- [x] `bom_items` 表增加 `group_name TEXT`（Panel 分组，旧数据兼容为 NULL）
- [x] `batches` 表增加 `verified INTEGER DEFAULT 1`（批次验证状态，旧数据默认已验证）
- [x] 使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 兼容旧库
- **影响范围**：仅新增字段，不影响现有数据读写
- **回滚**：`ALTER TABLE DROP COLUMN` 可回滚
- **状态：** complete

#### 3.2 后端：BOM 品牌池与分组支持
- [x] `bom-v1.1.ts` POST/PUT 接收并写入 `groupName`（可选）
- [x] `bom-v1.1.ts` GET /:id 返回物料列表（含 `groupName`，前端分组展示）
- [x] `bom-v1.1.ts` 理论成本改为**动态实时计算**：`Σ(usage × 批次加权平均价)`
- [x] `outbound-v1.1.ts` 新增 `allocateGroupBatches()`：在品牌池（同 group 的多物料）间按 FEFO 分配
- [x] `outbound-v1.1.ts` BOM 出库逻辑：先解析物料所属 group，在组内所有物料间分配批次
- [x] `reports-v1.1.ts` 新增 `GET /reports/cost-by-project-group` 接口
- [x] `inventory-v1.1.ts` 库存列表返回增加 `batchVerified` 字段（信息展示，不拦截）
- **影响范围**：
  - outbound 接口 URL/参数不变，内部逻辑新增品牌池分支
  - 单品牌场景（不填 groupName 或每组只有一个物料）行为与阶段2完全一致
  - 所有库存操作仍在事务内保护
- **状态：** complete
- **验证：**
  - Ki-67 组配置 Dako(库存5) + 迈新(库存20)，出库 10
  - 结果：Dako 扣 5，迈新扣 5，出库记录保存实际使用的两个品牌/批次
  - 单品牌出库行为与阶段2一致

#### 3.3 前端：BOM 分组与品牌池配置
- [x] `types/index.ts` `BOMMaterial` 增加 `groupName?: string`
- [x] `useBOMPage.ts` `BOMFormMaterial` 增加 `groupName`，`openEdit`/`handleSubmit`/`handleCopy` 支持传递
- [x] `BOMFormModal.tsx` 物料行增加"分组"文本输入框（可选填）
- [x] `BOMFormModal.tsx` 同一分组下支持添加多行（不同品牌），构成品牌池
- [x] `BOMFormModal.tsx` 组内显示各品牌当前库存状态提示
- [x] `BOMDetailModal.tsx` 按 `groupName` 聚合展示物料清单
- [x] `BOMDetailModal.tsx` 组内多品牌时显示"品牌池"标识和成本占比
- **影响范围**：仅 BOM 页面变更，不影响其他页面；旧 BOM 无 groupName 显示为"未分组"
- **状态：** complete
- **验证：**
  - MMR 四联检 BOM：MLH1/PMS2/MSH2/MSH6/通用试剂 各独立分组
  - 详情页按组聚合展示，组成本占比计算正确

#### 3.4 前端：分组成本报表
- [x] `useCostAnalysisPage.ts` 新增 `fetchGroupCostData()` 调用新接口
- [x] `CostAnalysis.tsx` 新增"项目分组成本"Tab（与项目成本/物料成本并列）
- [x] 报表展示：项目 → 分组 → 物料 三级下钻
- **影响范围**：仅成本分析页面新增 Tab，现有报表不受影响
- **状态：** complete
- **验证：**
  - MMR 四联检可下钻看到 MLH1 组成本、PMS2 组成本、通用试剂组成本
  - 各组成本之和等于项目总成本

#### 阶段 3 不改动的内容（明确排除）
| 功能 | 排除理由 |
|------|---------|
| 批次验证拦截出库 | 设计依据明确：验证是 SOP 要求，系统不拦截，仅展示 |
| BOM 版本管理 | v1.1 PRD 功能，超出阶段 3 范围 |
| 成本明细展示（计算过程） | 阶段 4.3 功能 |
| 退库成本回溯 | 阶段 4.4（P2）功能 |

---

### 阶段 4：完善与优化（P1-P2）
*目标：补齐逆向流程成本处理，提升报表可用性*

#### 4.1 BOM 理论成本动态计算
- [ ] 后端 `bom-v1.1.ts` GET /:id 时实时计算 unitCost
- [ ] 公式：Σ(bom_items.usage_per_sample × materials.price 或 batches 加权价)
- [ ] 移除/废弃 boms.unit_cost 字段的静态存储依赖
- **状态：** pending

#### 4.2 修复成本报表时间筛选
- [ ] 前端 `useCostAnalysisPage.ts` fetchData 传递 startDate/endDate
- [ ] 后端 `reports-v1.1.ts` 各接口确认已支持时间筛选（已支持，前端只需传参）
- **状态：** pending

#### 4.3 成本明细展示与差异归因（用户新增需求）
- [x] 前端：OutboundDetailModal 按物料聚合展示，支持展开批次明细
- [x] 前端：BOM 出库时展示成本计算说明（公式展开）
- [x] 前端：CostDetailModal 增加成本差异分析面板（价格差异+用量差异）
- [ ] 物料价格趋势图（近 N 次出库均价曲线）
- **状态：** complete（趋势图留待后续迭代）

#### 4.4 退库/退货成本回溯（P2）
- [x] `returns-v1.1.ts` 创建退库时，按「原发出成本追溯法」确定成本
- [x] `returns-v1.1.ts` 保存 unit_cost、total_cost、batch_id、batch_no
- [x] `returns-v1.1.ts` 撤销退库时恢复对应批次库存
- [x] `supplier-returns-v1.1.ts` 创建退货时强制选择批次（自动填充单价）
- [x] `supplier-returns-v1.1.ts` 删除退货时恢复对应批次库存
- [x] 成本报表 `/cost-by-material` 减去退库成本
- **状态：** complete

---

### 阶段 5：测试与验证
*目标：确保所有修复不影响现有功能，成本数据准确*

#### 5.1 单元测试
- [x] 测试 `allocateBatches`：单批次、多批次、库存不足、刚好用完、FEFO排序
- [x] 测试替代物料选择：主物料充足、主物料不足、替代也不足、跨物料FEFO
- [x] 测试 BOM 出库流程：创建、入库、出库、修改、删除（集成测试覆盖）

#### 5.2 集成测试（完整业务流程）
- [x] 流程 1：入库 → 建 BOM → 建项目关联 BOM → BOM 出库 → 查看成本报表
- [x] 流程 2：多批次入库 → 跨批次出库 → 验证成本加权正确
- [x] 流程 3：配置替代物料 → 主物料库存不足 → 验证自动替代 + 成本正确

#### 5.3 成本准确性验证
- [x] 场景 A：同一物料两个批次，出库量跨越两个批次
- [x] 场景 B：Panel 检测（3个抗体/试剂分组），验证总成本 = 各物料之和
- [x] 场景 C：修改出库单数量，验证成本重新计算
- [x] 场景 D：删除出库单，验证批次库存恢复、成本报表扣除
- **状态：** complete
- **验证：** 后端 19 个测试全部通过（单元 11 + 集成 1 + response 6 + sqlite-smoke 2）

---

### 阶段 6：扩展BOM + ABC全成本核算（v1.2）
*目标：从直接材料成本扩展到单切片全成本核算*

**设计依据**: `research-package.md` — 全球病理系统调研结论：无现成系统支持单切片全成本，需采用扩展BOM + ABC方案
**实施计划**: `implementation-plan-extended-bom-abc.md`

#### 6.1 BOM扩展（P0） ✅ 完成
- [x] 数据库：新增 `bom_general_reagents`、`bom_general_consumables`、`bom_quality_controls`、`bom_equipment_templates`
- [x] 后端：`bom-v1.1.ts` 支持通用试剂/耗材/质控品/设备模板的CRUD
- [x] 前端：`BOMFormModal.tsx` 增加4个配额Tab（通用试剂/通用耗材/质控品/设备模板）
- [x] 前端：`BOMDetailModal.tsx` 展示全成本构成（含扩展配额：通用试剂/耗材/质控品/设备模板）
- [ ] 出库逻辑：`outbound-v1.1.ts` BOM出库时包含扩展物料成本（留待 6.5 统一实现）
- **验收标准**: BOM可配置DAB/PBS等通用试剂、载玻片等通用耗材、质控品及覆盖样本数、设备使用时长

#### 6.2 设备管理模块（P0） ✅ 完成
- [x] 数据库：新增 `equipment`、`equipment_usage` 表
- [x] 后端：`equipment-v1.1.ts` 设备CRUD + 折旧计算（直线法/工作量法）
- [x] 前端：`EquipmentList.tsx` + `EquipmentFormModal.tsx`
- [ ] 出库关联：出库时记录设备使用并分摊折旧成本（留待 6.5 统一实现）
- **验收标准**: 设备档案管理、折旧计算正确、出库时自动分摊

#### 6.3 标准工时库（P0） ✅ 完成
- [x] 数据库：新增 `standard_labor_times` 表，预置默认数据（10条）
- [x] 后端：`labor-time-v1.1.ts` 工时定义CRUD
- [x] 前端：`LaborTimeList.tsx` + `LaborTimeFormModal.tsx`
- [ ] 出库人工成本计算：按项目类型匹配工时模板 × 费率（留待 6.5 统一实现）
- **验收标准**: 各环节标准工时和费率可配置，出库时自动计算人工成本

#### 6.4 间接成本中心（P1） ✅ 完成
- [x] 数据库：新增 `indirect_cost_centers`、`indirect_cost_allocations` 表
- [x] 后端：`indirect-cost-v1.1.ts` 成本中心CRUD + 月度分摊计算
- [x] 前端：`IndirectCostCenterList.tsx` + `CostCenterFormModal.tsx` + `AllocationModal.tsx`
- [ ] 分摊逻辑：按月度样本数平均分摊（留待 6.5 统一实现）
- **验收标准**: 房租/水电/管理费等可录入并按样本数分摊

#### 6.5 成本计算引擎与报表（P0） ✅ 完成
- [x] 数据库：新增 `project_cost_details` 表 + `outbound_records.sample_count` 字段迁移
- [x] 后端：新增 `utils/cost-calculator.ts` 全成本计算引擎（人工/设备/质控/间接成本）
- [x] 后端：`reports-v1.1.ts` 新增 `/reports/full-cost-by-project` 全成本报表API
- [x] 前端：`CostAnalysis.tsx` 增加"全成本分析"Tab
- [x] 前端：新增 `FullCostTable.tsx` 组件（材料+人工+设备+质控+间接 分项展示）
- [x] 前端：`useCostAnalysisPage.ts` 调用新报表API + 过滤分页
- [ ] 前端：`CostDetailModal.tsx` 增加成本结构饼图和差异分析（留待后续迭代）
- **验收标准**: 单切片全成本=材料+人工+设备+质控+间接，前端构建通过

#### 6.6 测试与验证（必须） ✅ 完成
- [x] 单元测试：`cost-calculator.test.ts` 21个测试全部通过（人工/设备/质控/间接/全成本汇总）
- [x] 集成测试：`full-cost.test.ts` 通过（建BOM含扩展配额→设备/工时/间接成本→入库→出库→全成本报表验证5项成本）
- [x] 回归测试：前端84个单元测试通过，后端34个测试通过（含原有allocation测试+新增cost-calculator测试）
- [x] Bug修复：`outbound-v1.1.ts` POST/POST /bom 接口补充 `sample_count` 字段保存
- [ ] 性能测试：全成本报表生成<5秒（需生产环境数据验证）
- [ ] E2E测试：Playwright配置有版本冲突（既有问题），需单独修复后执行

---

## 关键问题（已解答）

| # | 问题 | 答案 |
|---|------|------|
| 1 | 一个检测项目对应多个 BOM 还是一对一？ | **一对一**。BOM 内部通过 group_name 支持 Panel |
| 2 | 替代物料选哪种实现方式？ | **BOM 内替代**。出库时自动选择有库存的品牌 |
| 3 | 成本计算方法？ | **FEFO + 多批次加权**。先过期先用，成本按实际消耗批次加权 |
| 4 | 现有模型能支撑 PCR 吗？ | **能**。PCR Panel 与 IHC Panel 本质相同，复用现有模型 |
| 5 | 不改代码能先用吗？ | **不能**。有 3 个阻塞性 BUG 导致基础功能无法使用 |

---

## 已做决策

| 决策 | 理由 |
|------|------|
| 保持 project → bom 一对一 | 多对多会带来出库复杂、成本分摊模糊等问题 |
| BOM 内增加 group_name 实现 Panel 分组 | 最小改动，不影响现有逻辑 |
| 采用 FEFO + 加权成本 | 符合试剂管理行业惯例 |
| 替代物料采用 BOM 内替代 | 自动选择 + 保留历史成本追溯 |
| BOM 理论成本动态计算 | 避免静态值滞后 |
| 不单独为 PCR 建表 | PCR 与 IHC Panel 本质相同 |

---

## 文件变更清单（预估）

### 后端（7 个文件）
| 文件 | 变更内容 |
|------|---------|
| `DatabaseManager.ts` | 增加 bom_items.group_name、return_records 成本字段 |
| `projects-v1.1.ts` | POST/PUT 接收 bom_id |
| `bom-v1.1.ts` | 完整支持 materials 数组、group_name、isAlternative |
| `outbound-v1.1.ts` | 重写批次分配逻辑、替代物料选择 |
| `inventory-v1.1.ts` | 修复库存总价值计算 |
| `returns-v1.1.ts` | 增加成本字段（P2） |
| `reports-v1.1.ts` | 新增分组成本接口 |

### 前端（8 个文件）
| 文件 | 变更内容 |
|------|---------|
| `types/index.ts` | BOMMaterial 增加 groupName、isAlternative、mainItemId |
| `useBOMPage.ts` | BOMForm 增加 materials 字段 |
| `BOMFormModal.tsx` | 增加可编辑物料表格、分组输入、替代标记 |
| `BOMDetailModal.tsx` | 按 group 分组展示、显示替代关系 |
| `useProjectsPage.ts` | FormData 增加 bomId |
| `ProjectCreateModal.tsx` | 确保 bomId 正确传递 |
| `useCostAnalysisPage.ts` | 传递时间参数、新增分组成本 Tab |
| `CostAnalysis.tsx` | 新增"项目分组成本"Tab |

---

## 工作量预估

| 阶段 | 预估工时 | 优先级 |
|------|---------|--------|
| 阶段 1：阻塞性 BUG | 3-4 小时 | P0 |
| 阶段 2：成本核算核心 | 4-6 小时 | P0 |
| 阶段 3：功能增强 | 5-7 小时 | P1 |
| 阶段 4：完善优化 | 2-3 小时 | P1-P2 |
| 阶段 5：测试验证 | 2-3 小时 | 必须 |
| **总计** | **16-23 小时** | — |

---

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 暂无 | — | — |

---

---

## 阶段 7：PM-QA-001 全功能质量审查（新增）

**目标：** 使用 `/pm-qa-001` 三层防御体系，对 COREONE 所有现有功能进行系统性质量审查。

### 7.1 模块清单与优先级

| 优先级 | 模块 | 前端页面 | 后端路由 | 关键性 |
|--------|------|---------|---------|--------|
| P0 | 入库管理 | `inbound/` | `inbound-v1.1.ts` | 高 |
| P0 | 出库管理 | `outbound/` | `outbound-v1.1.ts` | 高 |
| P0 | 库存管理 | `inventory/` | `inventory-v1.1.ts` | 高 |
| P0 | BOM管理 | `bom/` | `bom-v1.1.ts` | 高 |
| P0 | 成本分析 | `report/CostAnalysis.tsx` | `reports-v1.1.ts` | 高 |
| P1 | 采购管理 | `purchase/` | `purchase-orders-v1.1.ts` | 中 |
| P1 | 预警管理 | `alerts/` | `alerts-v1.1.ts` | 高 |
| P1 | 设备管理 | `equipment/` | `equipment-v1.1.ts` | 中 |
| P1 | 工时管理 | `labor/` | `labor-time-v1.1.ts` | 中 |
| P1 | 对账管理 | `reconciliation/` | `reconciliation-v1.1.ts` | 中 |
| P1 | 退库/报废 | `returns/`, `scraps/` | `returns-v1.1.ts`, `scraps-v1.1.ts` | 中 |
| P2 | 主数据 | `master/` | `materials.ts`, `suppliers-v1.1.ts`, `categories-v1.1.ts` | 低 |
| P2 | 系统设置 | `system/` | `users-v1.1.ts`, `roles-v1.1.ts` | 低 |
| P2 | 调拨 | `transfers/` | `transfers-v1.1.ts` | 低 |

### 7.2 审查流程（每个模块）

每个模块执行以下步骤：
1. **VibeContract 重建**：基于代码反推业务契约
2. **测试质量审查**：检查断言严格性、Mock 使用、覆盖率
3. **危险信号扫描**：错误处理、权限检查、数据一致性
4. **边界缺失识别**：列出未测试的边界场景
5. **输出报告**：问题清单 + 改进建议

### 7.3 执行计划

- [ ] **Wave 1（P0 核心）**：inbound, outbound, inventory, bom, cost-analysis
- [ ] **Wave 2（P1 重要）**：purchase, alerts, equipment, labor, reconciliation, returns
- [ ] **Wave 3（P2 辅助）**：master, system, transfers
- [ ] **汇总报告**：生成风险矩阵和修复计划

### 状态
- **当前：** Wave 1 准备启动
- **发现汇总：** 见 `findings.md`

---

## 备注

- 每完成一个子任务，更新此文件中的复选框状态
- 阶段 1 和阶段 2 必须连续完成（有依赖关系）
- 阶段 3 的 3.1（数据库迁移）必须在阶段 3 其他任务之前完成
- 阶段 5 的测试必须在每个阶段完成后执行（增量测试）
- 所有数据库变更必须兼容旧数据（已有 BOM 和项目的 group_name 为空）
- **阶段 7（PM-QA-001）使用 Workflow 并行执行，每 Wave 完成后汇总到 findings.md**
