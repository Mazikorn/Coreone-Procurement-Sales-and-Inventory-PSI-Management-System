# COREONE E2E 场景化测试套件 - 实施总结

## 完成情况

基于"然后呢"三层追问设计理念，已完成以下测试套件的创建：

### 1. 共享工具模块
- [shared/auth.ts](shared/auth.ts) - 登录/认证/API调用工具

### 2. 技术员套件
- [technician-suite/project-outbound.spec.ts](technician-suite/project-outbound.spec.ts) - 项目领用出库完整流程

### 3. 仓管员套件
- [warehouse-manager-suite/purchase-inbound.spec.ts](warehouse-manager-suite/purchase-inbound.spec.ts) - 采购入库完整流程
- [warehouse-manager-suite/stocktaking.spec.ts](warehouse-manager-suite/stocktaking.spec.ts) - 盘点完整流程

### 4. 采购员套件
- [procurement-suite/create-purchase-order.spec.ts](procurement-suite/create-purchase-order.spec.ts) - 创建采购订单完整流程

### 5. 财务套件
- [finance-suite/cost-trend.spec.ts](finance-suite/cost-trend.spec.ts) - ABC 成本趋势流程

### 6. 场景化测试
- [technician-daily-work/full-day.spec.ts](technician-daily-work/full-day.spec.ts) - 技术员一天的工作完整流程

### 7. 文档
- [README.md](README.md) - 测试套件架构文档
- [TEST-PATH-MATRIX.md](TEST-PATH-MATRIX.md) - 测试路径矩阵文档

## "然后呢"三层追问设计理念

### 1. 场景端的"然后呢" — 树状扩散延伸场景

每个业务场景都不是孤立的，而是不断追问"然后呢"，形成场景树：

```
技术员出库
├── 项目领用出库
│   ├── 正常出库成功
│   │   └── 然后呢？→ 查看出库记录 → 查看详情 → 验证库存 → 验证成本
│   ├── 出库失败（库存不足）
│   │   └── 然后呢？→ 提示用户 → 等待补货 → 重新出库
│   ├── 出库失败（网络错误）
│   │   └── 然后呢？→ 重试 → 成功/失败 → 记录日志
│   └── 出库后发现错误
│       ├── 然后呢？→ 退库 → 库存回退 → 成本调整
│       └── 然后呢？→ 修改出库单 → 重新提交
├── 调拨出库
│   ├── 正常调拨成功
│   │   └── 然后呢？→ 查看调拨记录 → 验证库存变更
│   └── 调拨失败（库存不足）
│       └── 然后呢？→ 提示用户 → 等待补货 → 重新调拨
└── 报废出库
    ├── 正常报废成功
    │   └── 然后呢？→ 查看报废记录 → 验证库存减少
    └── 报废失败（库存不足）
        └── 然后呢？→ 提示用户 → 等待补货 → 重新报废
```

### 2. 操作端的"然后呢" — 不断指向延伸操作

每个用户操作都不是孤立的，而是不断追问"然后呢"，形成操作链：

```
项目领用出库操作链
├── 1. 登录 → 成功/失败
├── 2. 进入出库页面 → 成功/失败
├── 3. 点击"新增出库"按钮 → 成功/失败
├── 4. 选择出库类型 → 项目领用/调拨出库/报废出库
├── 5. 选择项目 → 成功/失败
├── 6. 选择BOM → 成功/失败
├── 7. 填写出库数量 → 成功/失败
├── 8. 提交出库 → 成功/失败（库存不足/网络错误）
├── 9. 验证出库成功 → 查看记录/查看详情/查看库存/查看成本
└── 10. 后续操作 → 继续出库/退库/查看报表
```

### 3. 测试路径矩阵 — 场景树 × 操作链

基于场景树和操作链，生成一个庞大的测试路径矩阵：

```
测试路径 = 场景节点 × 操作步骤 × 分支条件

示例：
路径1: 技术员出库 → 项目领用出库 → 正常出库成功 → 登录成功 → 进入出库页面成功 → 点击新增出库成功 → 选择项目领用 → 选择项目成功 → 选择BOM成功 → 填写数量成功 → 提交成功 → 验证出库记录 → 验证详情 → 验证库存 → 验证成本
```

## 测试用例特点

### 1. 场景连贯性
每个测试套件都模拟一个完整的业务场景，从开始到结束，不断追问"然后呢"。

### 2. 端到端验证
每个操作都验证业务结果，不只是API状态。

### 3. 角色权限验证
每个操作都验证角色权限是否正确。

### 4. 数据一致性验证
每个操作都验证数据一致性。

### 5. 异常情况处理
每个测试套件都包含异常情况处理，如库存不足、网络错误等。

### 6. 边界情况处理
每个测试套件都包含边界情况处理，如数量为0、负数等。

## 测试路径与代码路径匹配

### 线上路径（代码路径）
```
前端代码路径
├── 页面路径
│   ├── /login → 登录页面
│   ├── / → 首页
│   ├── /inbound → 入库页面
│   ├── /outbound → 出库页面
│   ├── /stocktaking → 盘点页面
│   ├── /inventory → 库存页面
│   ├── /bom → BOM页面
│   ├── /projects → 项目页面
│   ├── /suppliers → 供应商页面
│   ├── /purchase-orders → 采购订单页面
│   └── /abc/dashboard → ABC成本看板
└── API路径
    ├── /api/v1/auth/login → 登录API
    ├── /api/v1/inbound → 入库API
    ├── /api/v1/outbound → 出库API
    ├── /api/v1/stocktaking → 盘点API
    ├── /api/v1/inventory → 库存API
    ├── /api/v1/boms → BOM API
    ├── /api/v1/projects → 项目API
    ├── /api/v1/suppliers → 供应商API
    ├── /api/v1/purchase-orders → 采购订单API
    └── /api/v1/abc/profitability → 成本分析API
```

### 线下路径（用户操作路径）
```
用户操作路径
├── 技术员操作路径
│   ├── 登录 → 首页 → 出库页面 → 新增出库 → 选择项目领用 → 
│   │   选择项目 → 选择BOM → 填写数量 → 提交 → 查看出库记录
│   └── 登录 → 首页 → 出库页面 → 查看出库记录 → 查看详情 → 
│       查看库存 → 查看项目成本
├── 仓管员操作路径
│   ├── 登录 → 首页 → 入库页面 → 新增入库 → 选择采购入库 → 
│   │   选择物料 → 选择供应商 → 选择库位 → 填写数量 → 提交 → 
│   │   查看入库记录
│   └── 登录 → 首页 → 盘点页面 → 新建盘点 → 选择物料 → 
│       填写实际库存 → 提交 → 确认差异 → 查看盘点记录
├── 采购员操作路径
│   └── 登录 → 首页 → 采购订单页面 → 新增采购订单 → 
│       选择供应商 → 添加物料 → 填写数量单价 → 提交 → 
│       查看采购订单
└── 财务操作路径
    └── 登录 → 首页 → 成本分析页面 → 选择项目成本 → 
        选择时间范围 → 选择项目 → 查看成本数据 → 
        查看成本趋势 → 导出报表
```

## 运行测试

### 运行所有场景测试
```bash
cd 前端代码
npx playwright test e2e/scenarios/
```

### 运行特定角色套件
```bash
npx playwright test e2e/scenarios/technician-suite/
npx playwright test e2e/scenarios/warehouse-manager-suite/
npx playwright test e2e/scenarios/procurement-suite/
npx playwright test e2e/scenarios/finance-suite/
```

### 运行特定场景
```bash
npx playwright test e2e/scenarios/technician-daily-work/
```

### 调试模式运行
```bash
npx playwright test e2e/scenarios/technician-suite/project-outbound.spec.ts --debug
```

## 总结

通过"然后呢"三层追问设计理念，我们创建了一套完整的场景化测试套件：

1. **场景端的然后呢**：生成场景树，覆盖所有业务场景
2. **操作端的然后呢**：生成操作链，覆盖所有操作步骤
3. **测试路径矩阵**：场景树 × 操作链 × 分支条件，生成测试路径

每个测试路径都是一个完整的测试用例，每个测试用例都验证业务结果，形成线上（代码路径）和线下（用户操作）的匹配。

这样的测试设计能够真正验证系统的可用性，而不是仅仅检查页面是否报错。
