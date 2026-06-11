# 2026-06-05 场景化E2E测试套件全量补全

## 工作目标

基于 session-log 中已有的测试套件设计思路（TEST-PATH-MATRIX.md + README.md），补全所有角色×所有场景下的测试套件。

## 完成内容

### 新增 31 个场景化测试文件

**技术员套件（6个新增）：**
- `technician-suite/login.spec.ts` — 4路径22用例：登录成功/失败/菜单验证/权限边界
- `technician-suite/view-projects.spec.ts` — 4路径27用例：项目列表/详情/BOM关联/成本信息
- `technician-suite/view-bom.spec.ts` — 4路径28用例：BOM列表/详情/物料清单/成本预览
- `technician-suite/view-outbound-records.spec.ts` — 4路径30用例：出库记录/详情/日期筛选/项目筛选
- `technician-suite/return-material.spec.ts` — 4路径27用例：正常退库/数量超限/物料不存在/库存回退
- `technician-suite/view-inventory.spec.ts` — 4路径28用例：库存列表/数量验证/名称筛选/库存指标

**仓管员套件（5个新增）：**
- `warehouse-manager-suite/login.spec.ts` — 登录/菜单/权限
- `warehouse-manager-suite/direct-inbound.spec.ts` — 直接入库成功/失败/记录验证
- `warehouse-manager-suite/transfer-inbound.spec.ts` — 调拨入库成功/库存不足/记录验证
- `warehouse-manager-suite/outbound-approval.spec.ts` — 出库审批/详情/状态变更
- `warehouse-manager-suite/inventory-management.spec.ts` — 库存管理/统计/筛选/指标

**采购员套件（3个新增）：**
- `procurement-suite/login.spec.ts` — 登录/菜单/权限
- `procurement-suite/view-order-status.spec.ts` — 订单列表/详情/状态筛选/收货操作
- `procurement-suite/supplier-management.spec.ts` — 供应商列表/详情/创建/评级

**财务套件（3个新增）：**
- `finance-suite/login.spec.ts` — 登录/菜单/权限
- `finance-suite/cost-trend.spec.ts` — 成本趋势/时间筛选/导出
- `finance-suite/export-reports.spec.ts` — 报表导出/多类型/ABC导出

**管理员套件（4个全新）：**
- `admin-suite/login.spec.ts` — 管理员登录/全菜单/系统页面访问
- `admin-suite/user-management.spec.ts` — 用户CRUD完整流程
- `admin-suite/role-management.spec.ts` — 角色CRUD+权限配置
- `admin-suite/system-config.spec.ts` — 操作日志/筛选/预警中心

**业务流程套件（7个全新）：**
- `procurement-to-inbound-flow/full-flow.spec.ts` — 9步：采购→收货→入库→库存验证
- `project-outbound-flow/full-flow.spec.ts` — 8步：项目→BOM→出库→成本归集
- `stocktaking-flow/full-flow.spec.ts` — 5步：盘点→确认差异→库存调整
- `transfer-flow/full-flow.spec.ts` — 6步：调拨→库存变更验证
- `return-flow/full-flow.spec.ts` — 5步：退库→库存回退验证
- `scrap-flow/full-flow.spec.ts` — 5步：报废→库存减少验证
- `cost-analysis-flow/full-flow.spec.ts` — 12步：ABC看板→切片成本→盈利→趋势→导出

**日常工作套件（3个全新）：**
- `warehouse-manager-daily-work/full-day.spec.ts` — 10步仓管员完整工作日
- `procurement-daily-work/full-day.spec.ts` — 7步采购员完整工作日
- `finance-daily-work/full-day.spec.ts` — 8步财务完整工作日

### 最终统计

| 维度 | 数量 |
|------|------|
| 总测试文件 | 37（原有6 + 新增31） |
| 角色覆盖 | 6/6（admin, warehouse_manager, technician, procurement, finance, pathologist） |
| 场景套件 | 5角色 × 多场景 |
| 业务流程 | 7条完整链路 |
| 日常工作 | 4个角色完整工作日 |
| 所有路径 | 基于真实App.tsx路由+后端API端点 |

## 技术要点

- 所有文件遵循 `project-outbound.spec.ts` 的统一模式
- 路径来自 App.tsx 实际路由（46条路由）
- API 来自后端实际端点（130+ endpoints）
- 使用 `test.skip()` 防御数据依赖
- `路径N-步骤M` 命名规范
- "然后呢"三层追问设计贯穿所有文件
