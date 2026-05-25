---
name: backend-dev
description: COREONE 后端开发技能。Express + TypeScript + node:sqlite + JWT。
---

# 后端开发技能

## 何时使用

开发或修改 COREONE 后端 API 时激活。

## 技术栈

- Node.js 22 + Express 4.22
- TypeScript 5.9 (ESM, type: module)
- SQLite via `node:sqlite` DatabaseSync
- JWT (jsonwebtoken) + bcryptjs
- express-validator
- UUID

## 路由开发模式

```typescript
// routes/inventory-v1.1.ts
import { Router } from 'express'
import { body, param } from 'express-validator'
import { getDatabase } from '../database/DatabaseManager.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/v1/inventory
router.get('/', authenticateToken, requireRole('admin', 'warehouse_manager'), async (req, res, next) => {
  try {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM inventory WHERE is_deleted = 0').all()
    res.json({ success: true, data: rows })
  } catch (error) {
    next(error)
  }
})

// POST /api/v1/inventory
router.post('/',
  authenticateToken,
  requireRole('admin', 'warehouse_manager'),
  body('materialId').isUUID().withMessage('物料ID格式错误'),
  body('quantity').isFloat({ min: 0 }).withMessage('数量必须大于等于0'),
  async (req, res, next) => {
    try {
      // 校验...
      const db = getDatabase()
      const id = crypto.randomUUID()
      db.prepare('INSERT INTO inventory (id, material_id, stock) VALUES (?, ?, ?)')
        .run(id, req.body.materialId, req.body.quantity)
      res.json({ success: true, data: { id } })
    } catch (error) {
      next(error)
    }
  }
)

export default router
```

## 数据库访问模式

```typescript
import { getDatabase } from './database/DatabaseManager.js'

const db = getDatabase()

// 查询
const rows = db.prepare('SELECT * FROM materials WHERE category_id = ?').all(categoryId)

// 插入
const result = db.prepare('INSERT INTO materials (id, name) VALUES (?, ?)').run(id, name)

// 更新
db.prepare('UPDATE materials SET name = ? WHERE id = ?').run(name, id)

// 事务
db.exec('BEGIN TRANSACTION')
try {
  // ...多个操作
db.exec('COMMIT')
} catch (e) {
  db.exec('ROLLBACK')
  throw e
}
```

## 响应格式

统一响应结构：
```typescript
// 成功
res.json({ success: true, data: result })

// 失败
res.status(400).json({
  success: false,
  error: { message: '错误描述', code: 'ERROR_CODE' }
})
```

## 注意事项
- 所有路由文件使用 `.js` 扩展名导入（ESM 要求）
- 异步路由用 `async/await` + `try/catch` + `next(error)`
- SQL 必须用参数化，禁止 `${}` 拼接
- 权限检查在路由注册时声明，不在处理函数内判断
