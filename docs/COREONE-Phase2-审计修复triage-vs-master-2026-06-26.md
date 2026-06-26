# COREONE Phase 2 — 非 ABC 审计 P0/P1 修复 vs master triage

> 2026-06-26。判断 codex 工作线发现的审计 P0/P1 问题**是否同样存在于真实 master**（并行 fork）。只读核验，证据为 master 文件:行。结论：Phase 2 值得做，但**砍掉 5 项 N-A**，聚焦 4 真 P0 + ~10 真 P1。

## P0 triage

| # | 问题 | master | 证据 | 修复要点 |
|---|---|---|---|---|
| P0-01 | 耗尽确认绝对覆盖 batches.remaining+status，不联动三账 | **YES（更严重）** | `depletion-v1.1.ts:115-121` remain_qty 绝对覆盖 + 按 batch_no 模糊匹配；**全 route 无 BEGIN/COMMIT/ROLLBACK**；无 inventory/库位联动 | 拆领用台账 vs 仓库批次；退料用增量+stock_logs+按 batch_id 精确+包事务 |
| P0-02 | data_scope 空壳越权 | **N-A** | master roles 表无 data_scope 列(`DatabaseManager.ts:159`)、JWT 无 department；从未声称行级隔离 | 无需修（要做属新功能） |
| P0-03 | JWT 停用/改角色不失效 | **YES** | `middleware/auth.ts:72-78` 仅 jwt.verify 不回查 users；`auth.ts:9` 8h。`/auth/refresh`(83-88) 已有 status 回查可作模板 | 写敏感路由回查 users(status=1/未删/role 一致)，或 token_version |
| P0-04 | 预警阈值双轨(列表 min_stock/引擎 safety_stock) | **YES** | 引擎 `alerts-v1.1.ts:99-104` 用 safety_stock；前端 `MaterialFormModal.tsx:113`/`MaterialTable.tsx:193`/`useMaterialsPage.tsx:53` 用 minStock → 设值进 min_stock、引擎读 safety_stock(0)→静默失效 | 统一单阈值(建议都用 min_stock)+表单标签改"库存预警阈值"+回归 |
| P0-05 | BOM 加权标准成本 SQL 漏 material_id | **N-A** | master 无 updateBomStandardCost；standard_total_cost 是从不被写的空列(`DatabaseManager.ts:507`)；成本即时按主数据 m.price 算 | 无需修（加权标准成本属新功能） |
| P0-06 | 物料对账 actual 不按 project 过滤 | **YES** | `reconciliation-v1.1.ts:244-249`(/materials)actual 无 project_id 过滤；项目级(163)反而正确带 o.project_id | actual 补 `AND o.project_id IS NOT NULL AND o.project_id!=''` 同口径 |

## 代表性 P1 triage

| # | 问题 | master | 证据 |
|---|---|---|---|
| P1-01 | 辅料缺货整单回滚 | YES | `outbound-v1.1.ts:226-243` 每 item 缺货即 422，无辅料跳过；单批次.get(233) |
| P1-02 | 过期预警→报废断链 | YES | `AlertHandleModal.tsx:47-54` 无"去报废"深链 |
| P1-03 | 审计 before/after → [object Object] | YES | `LogDetailModal.tsx:57` `{String(value)}` 渲染嵌套对象 |
| P1-04 | 盘点一物一单无批量 | YES | `stocktaking-v1.1.ts:36-39` 单 materialId；无单头+明细+导入 |
| P1-05 | 设备录项目/出库归属 | **NO** | `equipment-v1.1.ts:556,600` 已支持 projectId/outboundId |
| P1-06 | 库位 used/利用率装饰 | YES | `locations-v1.1.ts:30` 返回 used 但全库无写；无 /stats |
| P1-08 | 设备折旧无 PSI 自动入口 | YES | outbound/bom 均无写 equipment_usage |
| P1-10 | Token 续期未接线 | YES | `api/request.ts:32-35` 401 只清 token，从不调 /auth/refresh(后端已有) |
| P1-11 | 登出残留 user/refreshToken/rememberUsername | YES | `TopBar.tsx:112` 仅 removeItem('token') |
| P1-12 | 库位写权限(仅 admin) vs 矩阵(admin+wm) | YES | `locations-v1.1.ts:10` requireRole('admin') 守写，但读+app.ts:81 给 wm |
| P1-13 | 供应商 refundAmount 无上界 | YES | `supplier-returns-v1.1.ts:134,150` refundAmount 原样落库不勾稽 |
| P1-14 | 退款财务闭环未达成 | YES | `supplier-returns-v1.1.ts:182-207` refundAmount 创建后不可改；refunded 无过账；finance 无权限 |
| P1-15 | BOMFormModal Hooks 违规 | **NO** | `BOMFormModal.tsx:22` 无任何 hook |
| P1-16 | 设备使用幂等 | **NO** | `equipment-v1.1.ts:572-577` 已有 (equipment_id,outbound_id) 去重 |

## 结论
- **值得移植修复**：P0-01（最高，master 连事务都没有）、P0-03、P0-04、P0-06 + P1-01/02/03/04/06/08/10/11/12/13/14。结构与 codex 线高度同构，修复思路可套用（但落到 master 实际代码）。
- **N-A 砍掉（省 ~1/4）**：P0-02、P0-05（master 无此功能，非 bug）；P1-05/15/16（master 已正确/已修）。
- 次序：P0-01 → P0-03 → P0-04/06 → P1 流程断裂 → P1 安全边界。
- 未核：横向工程债（§五：状态徽标重算/双 toast/设计 token）——如需再扫一轮。
