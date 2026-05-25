---
name: db-migration
description: COREONE 数据库变更工作流。适用于表结构变更、字段新增、索引调整。
allowed_tools: ["Read", "Write", "Edit", "Grep", "Bash"]
---

# /db-migration

在 COREONE 项目中进行数据库变更时使用此工作流。

## 目标

安全地修改 SQLite 数据库结构，兼容现有数据。

## 重要提醒

**本项目不使用独立 migration 文件**。数据库通过 `DatabaseManager.ts` 中的 `initializeDatabase()` 在应用启动时自动初始化。

## 常用文件

- `后端代码/server/src/database/DatabaseManager.ts` — 数据库初始化与迁移逻辑
- `后端代码/server/src/types/` — TypeScript 类型定义（如有）

## 建议流程

1. **分析变更需求**
   - 确定新增/修改/删除的表或字段
   - 评估对现有数据的影响

2. **修改 DatabaseManager.ts**
   - 新增表：添加 `CREATE TABLE IF NOT EXISTS` 语句
   - 新增字段：添加列兼容性迁移（见下方模式）
   - 修改约束：使用 SQLite 的表重建方式

3. **兼容旧数据迁移模式**

```typescript
// 示例：新增字段兼容性处理
try {
  const cols = database.prepare("PRAGMA table_info(materials)").all() as any[]
  const newCol = cols.find(c => c.name === 'new_field')
  if (!newCol) {
    database.exec(`ALTER TABLE materials ADD COLUMN new_field TEXT DEFAULT ''`)
    console.log('Migrated materials: added new_field')
  }
} catch (e: any) {
  console.error('Migration error:', e.message)
}
```

4. **验证**
   - 删除现有数据库文件（开发环境）
   - 重启后端：`npm run dev`
   - 检查控制台输出确认表创建成功
   - 测试 CRUD 操作

5. **如有数据迁移**
   - 在 `initializeDatabase()` 中添加数据转换逻辑
   - 确保幂等性（多次运行不重复执行）

6. **提交**
   ```
   feat(db): 添加 materials 表批次追踪字段
   ```

## SQLite 变更限制

SQLite 限制：
- `ALTER TABLE` 仅支持：RENAME TABLE、RENAME COLUMN、ADD COLUMN、DROP COLUMN
- 修改列类型/约束需重建表

重建表示例：
```typescript
database.exec(`
  BEGIN TRANSACTION;
  CREATE TABLE materials_new (...新结构...);
  INSERT INTO materials_new SELECT * FROM materials;
  DROP TABLE materials;
  ALTER TABLE materials_new RENAME TO materials;
  COMMIT;
`)
```

## 注意事项

- 所有迁移逻辑必须幂等（安全地多次运行）
- 生产环境变更前在开发环境充分测试
- 变更后通知团队成员更新代码
- 如改动较大，建议编写一次性迁移脚本在 `scripts/` 目录
