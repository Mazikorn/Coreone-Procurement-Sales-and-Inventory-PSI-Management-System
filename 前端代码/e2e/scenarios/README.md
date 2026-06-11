# COREONE E2E 场景化测试套件

## 设计理念

### 问题诊断
现有测试的主要问题：
1. **孤立的API测试**：每个测试只验证一个API调用，没有形成完整的业务流程
2. **缺乏真实UI交互**：大部分测试只是 `page.goto` + `waitForTimeout`，没有真正的用户操作
3. **没有端到端验证**：只检查API返回状态码，不验证业务结果
4. **缺乏场景连贯性**：每个测试独立，没有"然后呢"的追问

### 解决方案
基于真实业务场景设计连贯的测试套件：
1. **场景驱动**：每个测试套件模拟一个完整的业务场景
2. **角色导向**：按用户角色组织测试，模拟真实工作流程
3. **端到端验证**：每个操作都验证业务结果，不只是API状态
4. **连贯追问**：每个步骤都追问"然后呢"，直到业务流程结束

## 测试套件架构

### 一、按角色套件化

#### 1. 技术员套件 (`technician-suite/`)
- **技术员登录** → 验证登录成功，权限正确
- **查看项目** → 验证项目列表可见，数据正确
- **查看BOM** → 验证BOM清单可见，物料信息正确
- **项目领用出库** → 验证出库成功，库存扣减，成本归集
- **查看出库记录** → 验证记录可见，详情正确
- **退库** → 验证退库成功，库存回退
- **查看库存** → 验证库存数据正确

#### 2. 仓管员套件 (`warehouse-manager-suite/`)
- **仓管员登录** → 验证登录成功，权限正确
- **采购入库** → 验证入库成功，库存增加，批次信息正确
- **直接入库** → 验证入库成功，库存增加
- **调拨入库** → 验证调拨成功，库位变更
- **出库审批** → 验证审批流程正确
- **盘点** → 验证盘点成功，差异处理正确
- **库存管理** → 验证库存数据正确，预警功能正常

#### 3. 采购员套件 (`procurement-suite/`)
- **采购员登录** → 验证登录成功，权限正确
- **创建采购订单** → 验证订单创建成功，状态正确
- **查看订单状态** → 验证订单状态可见，数据正确
- **供应商管理** → 验证供应商列表可见，数据正确

#### 4. 财务套件 (`finance-suite/`)
- **财务登录** → 验证登录成功，权限正确
- **成本分析** → 验证成本数据可见，计算正确
- **成本趋势** → 验证趋势图表可见，数据正确
- **导出报表** → 验证导出功能正常，数据正确

#### 5. 管理员套件 (`admin-suite/`)
- **管理员登录** → 验证登录成功，权限正确
- **用户管理** → 验证用户列表可见，操作正确
- **角色管理** → 验证角色列表可见，权限配置正确
- **系统配置** → 验证配置功能正常

### 二、按业务流程套件化

#### 1. 采购到入库流程 (`procurement-to-inbound-flow/`)
```
采购员创建订单 → 采购员确认订单 → 仓管员收货入库 → 
验证库存增加 → 验证批次信息 → 验证采购订单状态更新
```

#### 2. 项目领用出库流程 (`project-outbound-flow/`)
```
技术员选择项目 → 技术员选择BOM → 技术员一键出库 → 
验证库存扣减 → 验证成本归集 → 验证出库记录 → 
技术员查看项目成本
```

#### 3. 盘点流程 (`stocktaking-flow/`)
```
仓管员创建盘点 → 仓管员输入实际数量 → 仓管员确认差异 → 
验证库存调整 → 验证盘点记录 → 验证库存日志
```

#### 4. 调拨流程 (`transfer-flow/`)
```
仓管员选择调出库位 → 仓管员选择调入库位 → 仓管员选择物料 → 
仓管员提交调拨 → 验证库存变更 → 验证调拨记录
```

#### 5. 退库流程 (`return-flow/`)
```
技术员选择出库记录 → 技术员填写退库原因 → 技术员提交退库 → 
验证库存回退 → 验证退库记录 → 验证成本调整
```

#### 6. 报废流程 (`scrap-flow/`)
```
仓管员选择物料 → 仓管员填写报废原因 → 仓管员提交报废 → 
验证库存减少 → 验证报废记录 → 验证成本调整
```

#### 7. 成本分析流程 (`cost-analysis-flow/`)
```
财务查看项目成本 → 财务查看成本趋势 → 财务查看单张切片成本 → 
财务导出成本报表 → 验证数据准确性
```

### 三、场景化测试套件

#### 场景1：技术员一天的工作 (`technician-daily-work/`)
```
技术员登录 → 查看今天项目 → 查看项目BOM → 确认物料可用 → 
项目领用出库 → 验证出库成功 → 查看出库记录 → 验证记录正确 → 
查看库存 → 验证库存扣减 → 发现出库错误 → 退库 → 验证退库成功 → 
验证库存回退 → 查看项目成本 → 验证成本归集正确
```

#### 场景2：仓管员一天的工作 (`warehouse-manager-daily-work/`)
```
仓管员登录 → 查看待处理采购订单 → 采购入库 → 验证入库成功 → 
查看库存 → 验证库存增加 → 处理直接入库 → 验证入库成功 → 
处理调拨入库 → 验证调拨成功 → 创建盘点 → 输入实际数量 → 
确认差异 → 验证库存调整 → 查看库存预警 → 验证预警功能正常
```

#### 场景3：采购员一天的工作 (`procurement-daily-work/`)
```
采购员登录 → 查看供应商列表 → 创建采购订单 → 选择供应商 → 
选择物料 → 填写数量单价 → 提交订单 → 验证订单创建成功 → 
查看订单状态 → 验证状态正确 → 订单到货 → 通知仓管员收货
```

#### 场景4：财务一天的工作 (`finance-daily-work/`)
```
财务登录 → 查看成本分析 → 验证数据可见 → 查看项目成本 → 
验证成本计算正确 → 查看成本趋势 → 验证趋势图表正确 → 
查看单张切片成本 → 验证成本计算正确 → 导出成本报表 → 
验证导出成功 → 成本异常排查 → 验证异常数据正确
```

## 测试文件组织

```
前端代码/e2e/scenarios/
├── README.md                           # 本文档
├── shared/                             # 共享工具函数
│   ├── auth.ts                         # 登录/认证工具
│   ├── api.ts                          # API调用工具
│   └── helpers.ts                      # 通用辅助函数
├── technician-suite/                   # 技术员套件
│   ├── login.spec.ts                   # 技术员登录
│   ├── view-projects.spec.ts           # 查看项目
│   ├── view-bom.spec.ts               # 查看BOM
│   ├── project-outbound.spec.ts        # 项目领用出库
│   ├── view-outbound-records.spec.ts   # 查看出库记录
│   ├── return-material.spec.ts         # 退库
│   └── view-inventory.spec.ts          # 查看库存
├── warehouse-manager-suite/            # 仓管员套件
│   ├── login.spec.ts                   # 仓管员登录
│   ├── purchase-inbound.spec.ts        # 采购入库
│   ├── direct-inbound.spec.ts          # 直接入库
│   ├── transfer-inbound.spec.ts        # 调拨入库
│   ├── outbound-approval.spec.ts       # 出库审批
│   ├── stocktaking.spec.ts            # 盘点
│   └── inventory-management.spec.ts    # 库存管理
├── procurement-suite/                  # 采购员套件
│   ├── login.spec.ts                   # 采购员登录
│   ├── create-purchase-order.spec.ts   # 创建采购订单
│   ├── view-order-status.spec.ts       # 查看订单状态
│   └── supplier-management.spec.ts     # 供应商管理
├── finance-suite/                      # 财务套件
│   ├── login.spec.ts                   # 财务登录
│   ├── cost-analysis.spec.ts           # 成本分析
│   ├── cost-trend.spec.ts              # 成本趋势
│   └── export-reports.spec.ts          # 导出报表
├── admin-suite/                        # 管理员套件
│   ├── login.spec.ts                   # 管理员登录
│   ├── user-management.spec.ts         # 用户管理
│   ├── role-management.spec.ts         # 角色管理
│   └── system-config.spec.ts           # 系统配置
├── procurement-to-inbound-flow/        # 采购到入库流程
│   └── full-flow.spec.ts               # 完整流程
├── project-outbound-flow/              # 项目领用出库流程
│   └── full-flow.spec.ts               # 完整流程
├── stocktaking-flow/                   # 盘点流程
│   └── full-flow.spec.ts               # 完整流程
├── transfer-flow/                      # 调拨流程
│   └── full-flow.spec.ts               # 完整流程
├── return-flow/                        # 退库流程
│   └── full-flow.spec.ts               # 完整流程
├── scrap-flow/                         # 报废流程
│   └── full-flow.spec.ts               # 完整流程
├── cost-analysis-flow/                 # 成本分析流程
│   └── full-flow.spec.ts               # 完整流程
├── technician-daily-work/              # 技术员一天的工作
│   └── full-day.spec.ts                # 完整一天
├── warehouse-manager-daily-work/       # 仓管员一天的工作
│   └── full-day.spec.ts                # 完整一天
├── procurement-daily-work/             # 采购员一天的工作
│   └── full-day.spec.ts                # 完整一天
└── finance-daily-work/                 # 财务一天的工作
    └── full-day.spec.ts                # 完整一天
```

## 测试用例设计原则

### 1. 场景连贯性
每个测试用例都模拟一个完整的业务场景，从开始到结束，不断追问"然后呢"。

**示例：技术员项目领用出库**
```typescript
test('技术员项目领用出库完整流程', async ({ page }) => {
  // 1. 技术员登录
  await loginAs(page, 'technician')
  
  // 2. 查看项目列表
  await page.goto(`${FE_BASE}/projects`)
  await expect(page.locator('table tbody tr')).toHaveCount.greaterThan(0)
  
  // 3. 选择项目
  const projectRow = page.locator('table tbody tr').first()
  await projectRow.click()
  
  // 4. 查看BOM清单
  await expect(page.locator('text=BOM清单')).toBeVisible()
  
  // 5. 选择BOM
  const bomRow = page.locator('table tbody tr').first()
  await bomRow.click()
  
  // 6. 一键出库
  await page.click('button:has-text("一键出库")')
  
  // 7. 填写出库信息
  await page.fill('input[name="sampleCount"]', '10')
  await page.click('button:has-text("确认出库")')
  
  // 8. 验证出库成功
  await expect(page.locator('text=出库成功')).toBeVisible()
  
  // 9. 查看出库记录
  await page.goto(`${FE_BASE}/outbound`)
  await expect(page.locator('table tbody tr')).toHaveCount.greaterThan(0)
  
  // 10. 验证记录正确
  const outboundRow = page.locator('table tbody tr').first()
  await expect(outboundRow).toContainText('项目领用')
  
  // 11. 查看详情
  await outboundRow.click()
  await expect(page.locator('text=物料明细')).toBeVisible()
  
  // 12. 验证库存扣减
  await page.goto(`${FE_BASE}/inventory`)
  const inventoryRow = page.locator('table tbody tr').first()
  await expect(inventoryRow).toContainText('库存减少')
  
  // 13. 查看项目成本
  await page.goto(`${FE_BASE}/cost-analysis`)
  await expect(page.locator('text=项目成本')).toBeVisible()
})
```

### 2. 端到端验证
每个操作都验证业务结果，不只是API状态。

**示例：验证库存扣减**
```typescript
// 不好的写法：只检查API状态
const res = await apiFetch(token, 'POST', '/outbound', { ... })
expect(res.status).toBe(201)

// 好的写法：验证业务结果
const beforeStock = await getStock(token, materialId)
await apiFetch(token, 'POST', '/outbound', { ... })
const afterStock = await getStock(token, materialId)
expect(afterStock).toBe(beforeStock - quantity)
```

### 3. 角色权限验证
每个操作都验证角色权限是否正确。

**示例：验证技术员不能创建入库单**
```typescript
test('技术员不能创建入库单', async ({ page }) => {
  await loginAs(page, 'technician')
  await page.goto(`${FE_BASE}/inbound`)
  
  // 验证没有新增入库按钮
  await expect(page.locator('button:has-text("新增入库")')).not.toBeVisible()
  
  // 验证API返回403
  const token = await apiLogin('technician')
  const res = await apiFetch(token, 'POST', '/inbound', { ... })
  expect(res.status).toBe(403)
})
```

### 4. 数据一致性验证
每个操作都验证数据一致性。

**示例：验证入库后库存增加**
```typescript
test('入库后库存增加', async ({ page }) => {
  // 1. 获取入库前库存
  const beforeStock = await getStock(token, materialId)
  
  // 2. 执行入库
  await apiFetch(token, 'POST', '/inbound', { ... })
  
  // 3. 获取入库后库存
  const afterStock = await getStock(token, materialId)
  
  // 4. 验证库存增加
  expect(afterStock).toBe(beforeStock + quantity)
  
  // 5. 验证库存日志
  const logs = await getStockLogs(token, materialId)
  expect(logs).toContainEqual(expect.objectContaining({
    type: 'inbound',
    quantity: quantity
  }))
})
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
```

### 运行特定业务流程
```bash
npx playwright test e2e/scenarios/project-outbound-flow/
```

### 运行特定场景
```bash
npx playwright test e2e/scenarios/technician-daily-work/
```

### 调试模式运行
```bash
npx playwright test e2e/scenarios/technician-suite/login.spec.ts --debug
```

## 测试数据管理

### 测试数据准备
每个测试套件都有 `beforeAll` 或 `beforeEach` 钩子来准备测试数据。

```typescript
test.beforeAll(async () => {
  // 登录获取token
  adminToken = await apiLogin('admin')
  
  // 准备测试数据
  await prepareTestData(adminToken)
})

test.beforeEach(async () => {
  // 清理测试数据
  await cleanupTestData(adminToken)
})
```

### 测试数据清理
每个测试套件都有 `afterAll` 或 `afterEach` 钩子来清理测试数据。

```typescript
test.afterAll(async () => {
  // 清理测试数据
  await cleanupTestData(adminToken)
})
```

## 持续集成

### GitHub Actions配置
```yaml
name: E2E Scenario Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install
      - run: npx playwright test e2e/scenarios/
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 最佳实践

### 1. 测试命名规范
```
场景-角色-操作-预期结果
```

**示例：**
```
技术员-项目领用出库-验证库存扣减
仓管员-采购入库-验证库存增加
财务-成本分析-验证数据正确
```

### 2. 测试步骤注释
每个测试步骤都要有清晰的注释，说明在做什么。

```typescript
test('技术员项目领用出库', async ({ page }) => {
  // 1. 技术员登录
  await loginAs(page, 'technician')
  
  // 2. 查看项目列表
  await page.goto(`${FE_BASE}/projects`)
  
  // 3. 选择项目
  const projectRow = page.locator('table tbody tr').first()
  await projectRow.click()
  
  // ... 更多步骤
})
```

### 3. 断言清晰
每个断言都要清晰说明期望的结果。

```typescript
// 不好的写法
await expect(page.locator('body')).toBeVisible()

// 好的写法
await expect(page.locator('text=出库成功')).toBeVisible()
await expect(page.locator('table tbody tr')).toHaveCount.greaterThan(0)
```

### 4. 错误处理
每个测试都要有错误处理，避免测试失败时无法定位问题。

```typescript
test('技术员项目领用出库', async ({ page }) => {
  try {
    // 测试步骤
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/projects`)
    
    // 验证项目列表
    const projectRows = page.locator('table tbody tr')
    await expect(projectRows).toHaveCount.greaterThan(0)
    
    // 选择项目
    const projectRow = projectRows.first()
    await projectRow.click()
    
    // ... 更多步骤
  } catch (error) {
    // 截图保存失败现场
    await page.screenshot({ path: 'test-failed.png' })
    throw error
  }
})
```

## 总结

通过场景化的测试套件设计，我们解决了现有测试的主要问题：

1. **场景连贯性**：每个测试套件模拟一个完整的业务场景
2. **角色导向**：按用户角色组织测试，模拟真实工作流程
3. **端到端验证**：每个操作都验证业务结果，不只是API状态
4. **数据一致性**：每个操作都验证数据一致性
5. **权限验证**：每个操作都验证角色权限是否正确

这样的测试设计能够真正验证系统的可用性，而不是仅仅检查页面是否报错。
