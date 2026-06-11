# ABC v4.3 — 废弃代码分析与处理方案（修订版 v3）

> **日期**: 2026-06-04
> **修订**: v4 — 基于 PM-QA-001 审查报告修订（解决 C-1, H-1, H-2, H-3, H-4, H-5, H-6）
> **分析范围**: 后端路由 + 前端页面 + 数据库 schema + 旧 ABC Phase 计划
> **分析方法**: 三代理并行探索（后端/前端/计划重叠）

---

## 一、废弃代码清单

### 1.1 前端 — 必须废弃

| # | 文件 | 废弃原因 | 处理方案 |
|---|------|---------|---------|
| F1 | `pages/cost/EquipmentEfficiency.tsx` | 100% 占位符，空数据数组，hardcoded `loading=false`，所有图表显示"后续将接入设备使用效率 API" | **保留路由 + 新建页面**：保留 `/abc/equipment-efficiency` 路由（预留未来设备效率分析），新建 `/equipment/depreciation-stats` 路由用于折旧统计页。删除所有 mock 数据，复用 UI 骨架（汇总卡片+排名表格+趋势图），接入真实折旧统计 API。参见 §五 H-5 修订 |
| F2 | `pages/cost/index.ts` 第11行 | `EquipmentEfficiency` 的 barrel export | 随 F1 一起更新：保留旧导出（路由别名），新增 `DepreciationStats` 组件导出 |

### 1.2 后端 — 占位代码必须处理

| # | 文件:行号 | 占位代码 | 处理方案 |
|---|----------|---------|---------|
| B1 | `reports-v1.1.ts:31` | `publicCost: 0` | **实现或删除**：如果 v4.3 不包含公共成本功能，改为不返回该字段；否则实现真实查询 |
| B2 | `reports-v1.1.ts:37` | `changeRate: 0, changeDirection: 'down'` | **实现**：基于月度环比计算真实变化率 |
| B3 | `reports-v1.1.ts:95-96` | `changeRate: 0, changeDirection: 'down', trend: []` | **实现**：与 B2 同步处理 |
| B4 | `reports-v1.1.ts:482-487` | `standardMaterialCost: 0` | **实现**：从 BOM 标准成本查询 |
| B5 | `reports-v1.1.ts:310-324` | 内联设备成本计算（直接 JOIN equipment） | **重构为调用 `calculateEquipmentCost`**：必须在迁移脚本执行前完成，参见 §三 修订说明 |

### 1.3 数据库 — Schema 变更（破坏性）

| # | 变更 | 影响范围 | 风险等级 | 处理方案 |
|---|------|---------|---------|---------|
| D1 | `bom_equipment_templates.equipment_id` → `equipment_type_id` | `bom-v1.1.ts`, `cost-calculator.ts`, `reports-v1.1.ts:310-324`（重构后） | **Critical** | 见 §二 详细迁移方案（含数据审计+事务保护+备份） |
| D2 | `equipment` 表新增 `type_id` | `equipment-v1.1.ts` 所有端点 | Medium | ALTER TABLE + 迁移脚本 |
| D3 | `standard_labor_times` 新增 `reference_source` | `labor-time-v1.1.ts` POST/PUT | Low | ALTER TABLE + 默认值 |

### 1.4 旧 ABC Phase 计划 — 部分废弃

| 旧计划任务 | 废弃原因 | 处理方案 |
|-----------|---------|---------|
| Phase 1 任务 1.10（人员技能成本配置） | v4.3 不包含 | **延期**至 v5.0，标记为 backlog |
| Phase 1 任务 1.11（BOM 版本管理增强） | v4.3 不包含 | **延期**，保留设计文档 |
| Phase 3 任务 3.11（预算管理） | 被 v4.3 季度调整部分替代 | **重构**：季度调整吸收预算跟踪的核心逻辑 |
| Phase 3 任务 3.12（质量成本分析） | v4.3 不包含 | **延期**至 v5.0 |
| Phase 3 任务 3.13（病种成本分析） | v4.3 不包含 | **延期**至 v5.0 |
| Phase 3 任务 3.14（成本预警规则） | v4.3 不包含 | **延期**，保留表结构 |
| Phase 3 任务 3.18（成本优化建议） | v4.3 不包含 | **延期**至 v5.0 |
| Phase 4 任务 4.8（质量成本报表） | v4.3 不包含 | **延期** |
| Phase 4 任务 4.9（成本预测） | v4.3 不包含 | **延期** |
| Phase 4 任务 4.10（成本模型验证） | v4.3 不包含 | **延期** |
| Phase 4 任务 4.11（供应商成本分析） | v4.3 不包含 | **延期** |
| Phase 4 任务 4.13（人员效率分析） | v4.3 不包含 | **延期** |

**延期任务总工时**: ~50h（约占旧计划总工时 106h 的 47%）

---

## 二、Critical 变更：BOM 设备模板迁移方案

### 2.1 问题

`bom_equipment_templates.equipment_id` 改为 `equipment_type_id` 是**破坏性 schema 变更**。SQLite 不支持 RENAME COLUMN（< 3.25.0），需要表重建。

### 2.2 影响链

```
bom_equipment_templates.equipment_id
    │
    ├──→ bom-v1.1.ts:212-218  (GET /:id detail — JOIN equipment)
    ├──→ bom-v1.1.ts:309-313  (POST / create — INSERT equipment_id)
    ├──→ bom-v1.1.ts:398-403  (PUT /:id update — DELETE+INSERT)
    ├──→ bom-v1.1.ts:53       (updateBomStandardCost → calculateEquipmentCost)
    ├──→ cost-calculator.ts:28-63 (calculateEquipmentCost — JOIN equipment)
    └──→ reports-v1.1.ts:310-324  (full-cost-by-project — 内联设备成本计算 ⚠️ 已重构为调用 calculateEquipmentCost)
```

### 2.3 迁移步骤

#### Step 0: 数据审计（迁移前必须执行）

```sql
-- 审计 1: 统计无 type_id 的设备数量
SELECT COUNT(*) AS no_type_count
FROM equipment
WHERE type_id IS NULL OR type_id = '';

-- 审计 2: 统计这些设备关联的 BOM 模板数量
SELECT COUNT(*) AS orphaned_template_count
FROM bom_equipment_templates bet
LEFT JOIN equipment e ON bet.equipment_id = e.id
WHERE e.type_id IS NULL OR e.type_id = '';

-- 审计 3: 列出待人工处理的记录详情
SELECT
  bet.id AS template_id,
  bet.bom_id,
  bet.equipment_id,
  e.name AS equipment_name,
  e.code AS equipment_code
FROM bom_equipment_templates bet
LEFT JOIN equipment e ON bet.equipment_id = e.id
WHERE e.type_id IS NULL OR e.type_id = '';
```

**审计结果决策**:
- `orphaned_template_count = 0` → 直接执行迁移
- `orphaned_template_count > 0` → 必须先执行 Step 2b 人工映射

#### Step 1: 备份（迁移前必须执行）

```bash
# 备份整个数据库文件
cp data/coreone.db data/coreone.db.backup-$(date +%Y%m%d%H%M%S)

# 或使用 SQLite 命令备份（在线安全）
sqlite3 data/coreone.db ".backup 'data/coreone.db.backup-$(date +%Y%m%d%H%M%S)'"
```

#### Step 2: 创建新表 + 迁移数据（TypeScript 迁移脚本，适配 `node:sqlite DatabaseSync`）

> **A-1 修订**: `node:sqlite` 的 `DatabaseSync` 不支持在单个 `exec()` 中执行含 BEGIN/COMMIT 的复合 SQL。事务控制需通过逐条 `database.exec()` 调用实现。以下为完整的 TypeScript 迁移脚本。
> **A-9 修订**: 迁移脚本执行前必须进入维护模式，阻塞所有写操作，防止并发写入导致数据丢失。

```typescript
// migration-bom-equipment-templates.ts
// 适配 node:sqlite DatabaseSync API
import { DatabaseSync } from 'node:sqlite';

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  orphanCount: number;
  orphans?: OrphanRecord[];
  error?: string;
}

interface OrphanRecord {
  templateId: string;
  bomId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  usageMinutes: number;
  createdAt: string;
}

export function migrateBomEquipmentTemplates(db: DatabaseSync): MigrationResult {
  // A-9 修订：迁移前检查维护模式标志
  // 方案 A（推荐）：应用层中间件检查 MAINTENANCE_MODE 环境变量，非迁移请求返回 503
  // 方案 B：使用 BEGIN EXCLUSIVE 锁阻塞所有写操作（已通过 BEGIN IMMEDIATE 实现）
  // 以下脚本使用 BEGIN IMMEDIATE，可阻塞其他写事务直到 COMMIT/ROLLBACK

  // Step 0: 数据审计 — 检查孤儿记录数量
  const orphanCount = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM bom_equipment_templates bet
    LEFT JOIN equipment e ON bet.equipment_id = e.id
    WHERE e.type_id IS NULL OR e.type_id = ''
  `).get() as { cnt: number };

  if (orphanCount.cnt > 0) {
    // 收集孤儿记录详情，返回给管理员处理
    const orphans = db.prepare(`
      SELECT
        bet.id AS templateId,
        bet.bom_id AS bomId,
        bet.equipment_id AS equipmentId,
        e.name AS equipmentName,
        e.code AS equipmentCode,
        bet.usage_minutes AS usageMinutes,
        bet.created_at AS createdAt
      FROM bom_equipment_templates bet
      LEFT JOIN equipment e ON bet.equipment_id = e.id
      WHERE e.type_id IS NULL OR e.type_id = ''
    `).all() as OrphanRecord[];

    return {
      success: false,
      migratedCount: 0,
      orphanCount: orphanCount.cnt,
      orphans,
      error: `存在 ${orphanCount.cnt} 条设备未分配类型，请先执行人工映射`
    };
  }

  // Step 2a-2c: 事务内执行迁移
  try {
    db.exec('BEGIN IMMEDIATE');

    // Step 2a: 创建新表
    db.exec(`
      CREATE TABLE IF NOT EXISTS bom_equipment_templates_v2 (
        id TEXT PRIMARY KEY,
        bom_id TEXT NOT NULL,
        equipment_type_id TEXT NOT NULL REFERENCES equipment_types(id),
        usage_minutes REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 2b: 迁移数据（仅迁移有 type_id 的设备）
    const insertResult = db.prepare(`
      INSERT INTO bom_equipment_templates_v2 (id, bom_id, equipment_type_id, usage_minutes, created_at)
      SELECT bet.id, bet.bom_id, e.type_id, bet.usage_minutes, bet.created_at
      FROM bom_equipment_templates bet
      JOIN equipment e ON bet.equipment_id = e.id
      WHERE e.type_id IS NOT NULL AND e.type_id != ''
    `).run();

    const migratedCount = insertResult.changes;

    // Step 2c: 验证迁移完整性
    const v1Count = (db.prepare('SELECT COUNT(*) AS cnt FROM bom_equipment_templates').get() as { cnt: number }).cnt;
    const v2Count = (db.prepare('SELECT COUNT(*) AS cnt FROM bom_equipment_templates_v2').get() as { cnt: number }).cnt;

    if (v2Count !== v1Count) {
      db.exec('ROLLBACK');
      return {
        success: false,
        migratedCount: 0,
        orphanCount: 0,
        error: `迁移完整性校验失败: v1=${v1Count}, v2=${v2Count}`
      };
    }

    // Step 3: 替换旧表
    db.exec('DROP TABLE bom_equipment_templates');
    db.exec('ALTER TABLE bom_equipment_templates_v2 RENAME TO bom_equipment_templates');
    db.exec('CREATE INDEX idx_bom_equipment_templates_bom_id ON bom_equipment_templates(bom_id)');
    db.exec('CREATE INDEX idx_bom_equipment_templates_type_id ON bom_equipment_templates(equipment_type_id)');

    db.exec('COMMIT');

    return {
      success: true,
      migratedCount,
      orphanCount: 0
    };
  } catch (err) {
    // 任何异常均回滚
    try { db.exec('ROLLBACK'); } catch { /* ROLLBACK 本身失败时忽略 */ }
    return {
      success: false,
      migratedCount: 0,
      orphanCount: 0,
      error: `迁移执行失败: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
```

#### Step 2b: 人工映射（当存在孤儿记录时）

对于无法自动迁移的记录（设备无 type_id），返回孤儿记录列表供管理员手动映射：

```typescript
// migration-helper.ts — 迁移辅助工具

// API: GET /api/v1/admin/migration/orphans
// 返回 migrateBomEquipmentTemplates() 返回的 orphans 列表

// API: POST /api/v1/admin/migration/map-orphans
// 接受 [{ templateId, equipmentTypeId }]，逐条更新 equipment.type_id
// 全部映射完成后，重新执行 migrateBomEquipmentTemplates()
```

**前端临时页面**（可选）：管理员可在 UI 上看到待处理列表，逐条选择设备类型，提交后自动完成迁移。

**维护模式中间件**（A-9 修订）:

```typescript
// middleware/maintenance.ts — 迁移期间阻塞非迁移请求
export function maintenanceMode(req: Request, res: Response, next: NextFunction) {
  if (process.env.MAINTENANCE_MODE === 'true') {
    // 仅允许迁移相关 API 通过
    if (req.path.startsWith('/api/v1/admin/migration')) {
      return next();
    }
    return res.status(503).json({
      success: false,
      error: '系统维护中，数据库迁移进行中，请稍后重试'
    });
  }
  next();
}
```

**迁移执行流程**:
1. 设置环境变量 `MAINTENANCE_MODE=true`
2. 重启应用（或热加载环境变量）
3. 执行迁移脚本 `migrateBomEquipmentTemplates(db)`
4. 成功后设置 `MAINTENANCE_MODE=false`

#### Step 3: 替换旧表

> 已合并到 Step 2 的 TypeScript 脚本中（`BEGIN IMMEDIATE` → `DROP TABLE` → `ALTER TABLE RENAME` → `CREATE INDEX` → `COMMIT`）。

#### Step 4: 验证迁移结果

```sql
-- 验证 1: 记录总数一致
SELECT
  (SELECT COUNT(*) FROM bom_equipment_templates) AS migrated_count,
  (SELECT COUNT(*) FROM _migration_orphans) AS skipped_count;

-- 验证 2: 无孤立记录
SELECT COUNT(*) AS orphan_count
FROM bom_equipment_templates bet
LEFT JOIN equipment_types et ON bet.equipment_type_id = et.id
WHERE et.id IS NULL;
-- 应为 0

-- 验证 3: 抽样检查成本计算
-- 随机选择 5 个 BOM，验证设备成本计算正确
```

### 2.4 代码变更清单

| 文件 | 变更 | 优先级 |
|------|------|--------|
| `DatabaseManager.ts` | 新建 `equipment_types` 表 + 迁移 `bom_equipment_templates`（含审计+备份+事务） | P0 |
| `bom-v1.1.ts:212-218` | JOIN 改为 `equipment_types` | P0 |
| `bom-v1.1.ts:309-313` | INSERT 改为 `equipment_type_id` | P0 |
| `bom-v1.1.ts:398-403` | DELETE+INSERT 改为 `equipment_type_id` | P0 |
| `cost-calculator.ts:28-63` | `calculateEquipmentCost` 改为按类型计算 | P0 |
| `reports-v1.1.ts:310-324` | 内联设备成本计算重构为调用 `calculateEquipmentCost`（**必须在迁移前完成**） | P0 |
| `routes/admin/migration-v1.1.ts`（新建） | 迁移辅助 API（孤儿记录查询+映射） | P0 |

### 2.5 设备类型成本计算策略（H-1 修订）

**推荐方案：设备类型表存储默认折旧参数 + 支持加权平均模式**

```sql
CREATE TABLE equipment_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  -- 默认折旧参数（用于 BOM 成本预览 type_default 模式）
  default_purchase_price DECIMAL(18,4) DEFAULT 0,
  default_depreciable_life_years INTEGER DEFAULT 5,
  default_residual_value DECIMAL(18,4) DEFAULT 0,
  default_depreciation_method TEXT DEFAULT 'straight_line',
  default_total_capacity INTEGER DEFAULT 0,
  default_capacity_unit TEXT DEFAULT 'minutes',
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**成本计算模式（costMode 参数）**:

| costMode | 说明 | 使用场景 | 默认 |
|----------|------|---------|------|
| `type_default` | 使用 `equipment_types` 表中的默认折旧参数 | 快速估算、设备未入库时 | 否 |
| `equipment_average` | 使用该类型下所有设备的加权平均参数 | 精确预览、财务决策 | **是** |

**equipment_average 加权计算逻辑**:

> **A-2 修订**: 添加 `totalCapacity === 0` 的除零保护，回退到简单算术平均。
> **A-3 修订**: 按 `depreciation_method` 分组计算，避免混合折旧方法导致加权平均无意义。

```typescript
// cost-calculator.ts — 按设备类型加权平均计算
function calculateEquipmentCostByType(db: DatabaseSync, typeId: string, usageMinutes: number): EquipmentCostResult {
  // 1. 查询该类型下所有启用设备的参数
  const equipment = db.prepare(`
    SELECT purchase_price, depreciable_life_years, residual_value, total_capacity, depreciation_method
    FROM equipment
    WHERE type_id = ? AND status = 1
  `).all(typeId) as EquipmentRow[];

  if (equipment.length === 0) {
    // 回退到类型默认参数
    return calculateByTypeDefault(db, typeId, usageMinutes);
  }

  // 2. 按折旧方法分组计算（A-3 修订：避免混合折旧方法导致加权平均无意义）
  const groups = new Map<string, EquipmentRow[]>();
  for (const eq of equipment) {
    const method = eq.depreciation_method || 'straight_line';
    if (!groups.has(method)) groups.set(method, []);
    groups.get(method)!.push(eq);
  }

  let totalCost = 0;
  let totalWeight = 0; // 按设备数量加权

  for (const [method, group] of groups) {
    const groupCapacity = group.reduce((sum, e) => sum + e.total_capacity, 0);

    let avgPurchasePrice: number;
    let avgDepreciableLifeYears: number;
    let avgResidualValue: number;
    let avgCapacity: number;

    if (groupCapacity === 0) {
      // A-2 修订：totalCapacity === 0 时回退到简单算术平均（避免除零）
      avgPurchasePrice = group.reduce((sum, e) => sum + e.purchase_price, 0) / group.length;
      avgDepreciableLifeYears = group.reduce((sum, e) => sum + e.depreciable_life_years, 0) / group.length;
      avgResidualValue = group.reduce((sum, e) => sum + e.residual_value, 0) / group.length;
      avgCapacity = 0;
    } else {
      // 加权平均（按 total_capacity 权重）
      avgPurchasePrice = group.reduce((sum, e) => sum + e.purchase_price * e.total_capacity, 0) / groupCapacity;
      avgDepreciableLifeYears = group.reduce((sum, e) => sum + e.depreciable_life_years * e.total_capacity, 0) / groupCapacity;
      avgResidualValue = group.reduce((sum, e) => sum + e.residual_value * e.total_capacity, 0) / groupCapacity;
      avgCapacity = groupCapacity / group.length;
    }

    // 3. 按折旧方法计算单位成本
    let groupCost = 0;
    if (method === 'straight_line') {
      if (avgDepreciableLifeYears > 0 && avgCapacity > 0) {
        const annualDepreciation = (avgPurchasePrice - avgResidualValue) / avgDepreciableLifeYears;
        const costPerMinute = annualDepreciation / (avgCapacity * 12);
        groupCost = costPerMinute * usageMinutes * group.length;
      }
    } else if (method === 'units_of_production') {
      // 工作量法：按实际使用量分摊
      if (groupCapacity > 0) {
        const depreciableBase = avgPurchasePrice - avgResidualValue;
        const costPerMinute = depreciableBase / (groupCapacity * 12 * avgDepreciableLifeYears);
        groupCost = costPerMinute * usageMinutes * group.length;
      }
    }

    totalCost += groupCost;
    totalWeight += group.length;
  }

  // 4. 构造价格来源说明
  const methodCount = groups.size;
  const note = methodCount > 1
    ? `基于 ${equipment.length} 台设备（${methodCount} 种折旧方法分组计算）`
    : `基于 ${equipment.length} 台设备的加权平均参数`;

  return {
    cost: totalCost,
    priceSource: 'equipment_average',
    equipmentCount: equipment.length,
    note,
  };
}
```

**priceSource 字段（响应标注）**:

| priceSource 值 | 含义 | 前端展示 |
|----------------|------|---------|
| `type_default` | 使用设备类型默认参数 | "基于类型默认参数" |
| `equipment_average` | 使用该类型下 N 台设备加权平均 | "基于 N 台设备加权平均" |
| `actual` | 使用实际出库设备参数（出库场景） | "基于实际设备参数" |

**成本计算逻辑汇总**:
- BOM 成本预览（`costMode=type_default`）：使用 `equipment_types` 的默认参数
- BOM 成本预览（`costMode=equipment_average`，**默认**）：使用该类型下所有设备的加权平均参数
- 实际出库成本：使用该类型下实际使用设备的参数（priceSource='actual'）
- 折旧统计：聚合该类型下所有设备的实际折旧数据

---

## 三、`reports-v1.1.ts` 内联代码重复问题

### 3.1 问题

`reports-v1.1.ts:310-324` 存在**内联设备成本计算**，直接 `JOIN bom_equipment_templates et JOIN equipment e ON et.equipment_id = e.id`，绕过了 `cost-calculator.ts` 的 `calculateEquipmentCost` 函数。

### 3.2 处理方案

**统一调用 `cost-calculator.ts`**（必须在迁移脚本执行前完成）：

> **A-5 修订**: 重构时保留批量预加载模式，避免 N+1 查询。提供 `calculateEquipmentCostBatch` 批量版本。

```typescript
// reports-v1.1.ts — 删除内联计算（lines 310-324），改为：
import { calculateEquipmentCostBatch } from '../utils/cost-calculator.js';

// 在 full-cost-by-project 查询中：
// 1. 批量收集所有出库记录涉及的 BOM ID + sampleCount
const bomSamples = outboundRecords.map(r => ({ bomId: r.bom_id, sampleCount: r.sample_count }));

// 2. 批量计算（内部预加载所有 BOM 的设备模板数据，避免 N+1）
const costMap = calculateEquipmentCostBatch(db, bomSamples, 'equipment_average');

// 3. 每条出库记录取对应 BOM 的设备成本
for (const record of outboundRecords) {
  const equipmentCost = costMap.get(record.bom_id) ?? 0;
  // ...
}
```

**`calculateEquipmentCostBatch` 实现要点**:
```typescript
// cost-calculator.ts — 批量版本（A-5 修订）
export function calculateEquipmentCostBatch(
  db: DatabaseSync,
  bomSamples: Array<{ bomId: string; sampleCount: number }>,
  costMode: string
): Map<string, number> {
  const uniqueBomIds = [...new Set(bomSamples.map(s => s.bomId))];

  // 预加载：一次查询获取所有 BOM 的设备模板 + 设备参数
  const allTemplates = db.prepare(`
    SELECT bet.bom_id, bet.equipment_type_id, bet.usage_minutes,
           e.purchase_price, e.depreciable_life_years, e.residual_value,
           e.total_capacity, e.depreciation_method
    FROM bom_equipment_templates bet
    LEFT JOIN equipment e ON bet.equipment_type_id = e.type_id AND e.status = 1
    WHERE bet.bom_id IN (${uniqueBomIds.map(() => '?').join(',')})
  `).all(...uniqueBomIds) as TemplateRow[];

  // 按 bomId 分组，计算每个 BOM 的设备成本
  const costMap = new Map<string, number>();
  // ... 计算逻辑与 calculateEquipmentCost 相同，但使用预加载数据
  return costMap;
}
```

### 3.3 执行顺序约束

```
reports-v1.1.ts 重构（Step 1.3）
    ↓ 验证：现有测试通过，设备成本计算结果不变
    ↓
bom_equipment_templates 迁移脚本（Step 1.1）
    ↓
后续开发
```

**关键约束**: 如果重构前执行迁移，`reports-v1.1.ts` 中的 `JOIN equipment e ON et.equipment_id = e.id` 会因为列名变更而直接报错。

**收益**：
- 消除重复代码
- 设备类型迁移只需改一处
- 成本计算逻辑统一维护

---

## 四、变更影响面报告

### 4.1 按模块统计

| 模块 | 受影响文件数 | 新增文件 | 修改文件 | 废弃文件 |
|------|:-----------:|:-------:|:-------:|:-------:|
| 数据库 | 1 | 0 | 1 | 0 |
| 后端路由 | 6 | 3 | 3 | 0 |
| 后端工具 | 1 | 0 | 1 | 0 |
| 前端页面 | 9 | 5 | 4 | 1 |
| 前端 API | 2 | 0 | 2 | 0 |
| 前端类型 | 1 | 0 | 1 | 0 |
| 前端路由 | 2 | 0 | 2 | 0 |
| **合计** | **22** | **8** | **14** | **1** |

### 4.2 回滚方案

| 变更 | 回滚方式 |
|------|---------|
| 新增 `equipment_types` 表 | DROP TABLE（无数据依赖） |
| `equipment.type_id` 字段 | ALTER TABLE DROP COLUMN（SQLite 3.35+） |
| `bom_equipment_templates` 重建 | 从 `data/coreone.db.backup-*` 恢复旧表 |
| 新增 `cost_adjustments` 表 | DROP TABLE（无数据依赖） |
| `standard_labor_times.reference_source` | ALTER TABLE DROP COLUMN |
| 新增路由文件 | 删除文件 + 从 app.ts 移除注册 |
| 前端页面修改 | git revert |

---

## 五、成本预览缓存策略（H-6 修订）

### 5.1 策略定义

| 阶段 | 策略 | 触发条件 | 说明 |
|------|------|---------|------|
| 初期 | **不缓存** | 默认 | 实时计算，监控响应时间 |
| 优化期 | **内存缓存** | 响应时间持续 > 2s | `Map<string, {data, timestamp}>`，TTL=300s |

### 5.2 缓存实现（当需要时）

```typescript
// cost-preview-cache.ts
const costPreviewCache = new Map<string, { data: CostPreviewResult; timestamp: number }>();
const CACHE_TTL = 300 * 1000; // 300 秒
const MAX_CACHE_SIZE = 500; // A-4 修订：缓存容量上限

export function getCachedCostPreview(bomId: string, costMode: string): CostPreviewResult | null {
  const key = `${bomId}:${costMode}`;
  const cached = costPreviewCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  costPreviewCache.delete(key);
  return null;
}

export function setCachedCostPreview(bomId: string, costMode: string, data: CostPreviewResult): void {
  const key = `${bomId}:${costMode}`;

  // A-4 修订：超过容量上限时淘汰最早插入的条目（FIFO）
  if (costPreviewCache.size >= MAX_CACHE_SIZE && !costPreviewCache.has(key)) {
    const oldestKey = costPreviewCache.keys().next().value;
    if (oldestKey) costPreviewCache.delete(oldestKey);
  }

  costPreviewCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateBomCostCache(bomId: string): void {
  // 删除该 BOM 的所有缓存（所有 costMode）
  for (const key of costPreviewCache.keys()) {
    if (key.startsWith(bomId + ':')) {
      costPreviewCache.delete(key);
    }
  }
}

// A-4 修订：定期清理过期条目（可选，配合定时器使用）
export function cleanupExpiredCache(): number {
  let cleaned = 0;
  const now = Date.now();
  for (const [key, entry] of costPreviewCache) {
    if (now - entry.timestamp >= CACHE_TTL) {
      costPreviewCache.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}
```

### 5.3 缓存失效条件

| 触发场景 | 操作 | 说明 |
|---------|------|------|
| BOM 物料变更 | `PUT /api/v1/boms/:id` | 调用 `invalidateBomCostCache(bomId)` |
| BOM 设备模板变更 | `PUT /api/v1/boms/:id` | 同上 |
| BOM 工时变更 | `PUT /api/v1/boms/:id` | 同上 |
| 间接成本中心月度费用变更 | `PUT /api/v1/indirect-cost-centers/:id` | 清除所有 BOM 缓存（影响全局） |
| 设备类型默认参数变更 | `PUT /api/v1/equipment-types/:id` | 清除引用该类型的所有 BOM 缓存 |

### 5.4 监控指标

- 首次计算响应时间（基线）
- 缓存命中率（当启用缓存后）
- 缓存内存占用

---

## 六、季度调整权限矩阵（H-3 修订）

### 6.1 权限矩阵

| 操作 | admin | finance | technician | warehouse_manager | 其他 |
|------|:-----:|:-------:|:----------:|:-----------------:|:----:|
| 查看调整建议 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 生成调整建议 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 手动创建调整 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 审核调整 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 查看调整记录 | ✅ | ✅ | ❌ | ❌ | ❌ |

### 6.2 自我审核约束

**规则**: admin 和 finance 可以调整和审核，但不能审核自己提交的调整。

**实现逻辑**:

```typescript
// cost-adjustment-v1.1.ts — POST /:id/review
if (adjustment.submitted_by === req.user.id) {
  return res.status(403).json({
    success: false,
    error: '不能审核自己提交的调整，请由其他管理员或财务人员审核'
  });
}
```

**数据库字段支撑**:

```sql
CREATE TABLE cost_adjustments (
  id TEXT PRIMARY KEY,
  cost_center_id TEXT NOT NULL REFERENCES indirect_cost_centers(id),
  year_quarter TEXT NOT NULL CHECK(year_quarter GLOB '20[0-9][0-9]-Q[1-4]'),  -- A-6 修订：格式校验
  actual_amount DECIMAL(18,4) NOT NULL,
  adjustment_amount DECIMAL(18,4) NOT NULL,
  submitted_by TEXT NOT NULL REFERENCES users(id),        -- A-6 修订：FK 约束
  review_status TEXT DEFAULT 'pending'
    CHECK(review_status IN ('pending', 'approved', 'rejected')),  -- A-6 修订：CHECK 约束
  reviewed_by TEXT REFERENCES users(id),                   -- A-6 修订：FK 约束
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 七、跨年季度计算公式（H-4 修订）

### 7.1 季度计算公式

> **A-10 修订**: 统一使用 `YYYY-QN` 格式（如 `2026-Q1`），抽取为共享 SQL 常量 `QUARTER_EXPRESSION`，所有使用处引用同一来源。

```sql
-- 共享 SQL 常量: QUARTER_EXPRESSION
-- 统一格式: strftime('%Y', date) || '-Q' || CASE WHEN ... END
-- 结果示例: '2026-Q1', '2025-Q4'

-- SQLite 季度计算（兼容跨年）
-- 季度标签 = year || '-Q' || CEIL(month / 3)
-- 注意: 使用 'Q1'/'Q2'/'Q3'/'Q4' 格式，不是 '1'/'2'/'3'/'4'

SELECT
  strftime('%Y', date) AS year,
  strftime('%Y', date) || '-Q' ||
    CASE
      WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 1 AND 3 THEN '1'
      WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 4 AND 6 THEN '2'
      WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 7 AND 9 THEN '3'
      WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 10 AND 12 THEN '4'
    END AS period,
  SUM(amount) AS total_cost
FROM cost_records
WHERE date BETWEEN ? AND ?
GROUP BY period
ORDER BY period;
```

**TypeScript 常量**（所有使用处引用）:
```typescript
// utils/quarter.ts — 共享季度计算表达式
export const QUARTER_EXPRESSION = `
  strftime('%Y', date) || '-Q' ||
  CASE
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 1 AND 3 THEN '1'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 4 AND 6 THEN '2'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 7 AND 9 THEN '3'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 10 AND 12 THEN '4'
  END
`;
```

### 7.2 跨年边界验证

**关键**: 年份取自记录日期的 `strftime('%Y', date)`，季度取自月份，两者独立计算。因此 2025-12 自动归入 `2025-Q4`，2026-01 自动归入 `2026-Q1`，不会混淆。

**对抗性测试用例**:

```typescript
it('跨年时间范围的季度聚合应正确分组', async () => {
  // 插入 2025-Q4 和 2026-Q1 数据
  await createCostRecord({ date: '2025-10-15', amount: 10000 })
  await createCostRecord({ date: '2025-12-20', amount: 15000 })
  await createCostRecord({ date: '2026-01-10', amount: 12000 })
  await createCostRecord({ date: '2026-03-25', amount: 8000 })

  const trend = await getCostTrend({
    dimension: 'quarterly',
    startDate: '2025-10',
    endDate: '2026-03'
  })

  expect(trend.map(t => t.period)).toEqual(['2025-Q4', '2026-Q1'])
  expect(trend.find(t => t.period === '2025-Q4').totalCost).toBe(25000)
  expect(trend.find(t => t.period === '2026-Q1').totalCost).toBe(20000)
})
```

---

## 八、修订记录

| 修订 | 日期 | 变更 | 对应问题 |
|------|------|------|---------|
| v1 | 2026-06-04 | 初始版本 | — |
| v2 | 2026-06-04 | F1 改为保留旧路由 + 新建独立路由 | H-5 |
| v2 | 2026-06-04 | 新增 B5（reports-v1.1.ts 内联代码重构） | H-2 |
| v2 | 2026-06-04 | §二 迁移方案增加 Step 0 数据审计 + Step 1 备份 + 事务保护 + Step 2b 人工映射 | C-1 |
| v2 | 2026-06-04 | §二.5 增加 costMode 参数说明（equipment_average 默认） | H-1 |
| v2 | 2026-06-04 | §三 增加执行顺序约束 | H-2 |
| v2 | 2026-06-04 | §四 更新影响面统计 | 全局 |
| v3 | 2026-06-04 | §二.5 扩展 costMode 详细说明：加权平均计算逻辑、priceSource 字段定义、回退策略 | H-1 |
| v3 | 2026-06-04 | §五 新增成本预览缓存策略（初期不缓存 + 优化期内存缓存 + 失效条件 + 监控指标） | H-6 |
| v3 | 2026-06-04 | §六 修订记录更新 | 全局 |
| v4 | 2026-06-04 | §六 新增季度调整权限矩阵（admin/finance 操作权限 + 自我审核约束） | H-3 |
| v4 | 2026-06-04 | §七 新增跨年季度计算公式（SQL 实现 + 对抗性测试用例） | H-4 |
| v4 | 2026-06-04 | §八 修订记录更新（原 §六 重编号） | 全局 |

---

*本报告基于三代理并行探索（后端/前端/计划重叠）生成。修订版 v4 基于 PM-QA-001 审查报告反馈，解决全部 1C+6H 问题。*
