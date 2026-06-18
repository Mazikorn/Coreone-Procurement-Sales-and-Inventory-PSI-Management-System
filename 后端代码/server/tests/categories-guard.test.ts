process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedCategoryTree(db: any, suffix: string) {
  const rootId = `cat-guard-root-${suffix}`
  const childId = `cat-guard-child-${suffix}`
  const grandchildId = `cat-guard-grandchild-${suffix}`
  const otherRootId = `cat-guard-other-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(rootId, `CG${suffix}00`, '分类守卫根', null, 1, 0)
  db.prepare('INSERT INTO material_categories (id, code, name, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(childId, `CG${suffix}01`, '分类守卫子', rootId, 2, 0)
  db.prepare('INSERT INTO material_categories (id, code, name, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(grandchildId, `CG${suffix}02`, '分类守卫孙', childId, 3, 0)
  db.prepare('INSERT INTO material_categories (id, code, name, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(otherRootId, `CG${suffix}90`, '分类守卫另一个根', null, 1, 0)

  return { rootId, childId, grandchildId, otherRootId }
}

describe('物料分类层级守卫', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('CAT-GUARD-001: 编辑分类时允许只读编码原样回传', async () => {
    const suffix = `${Date.now()}1`
    const { rootId } = seedCategoryTree(db, suffix)

    const res = await request(app)
      .put(`/api/v1/categories/${rootId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `CG${suffix}00`,
        name: '分类守卫根-已改名',
        parentId: null,
        level: 1,
        sortOrder: 3,
      })

    expect(res.status).toBe(200)
    const row = db.prepare('SELECT code, name, level, sort_order FROM material_categories WHERE id = ?').get(rootId) as any
    expect(row.code).toBe(`CG${suffix}00`)
    expect(row.name).toBe('分类守卫根-已改名')
    expect(Number(row.level)).toBe(1)
    expect(Number(row.sort_order)).toBe(3)
  })

  it('CAT-GUARD-002: 不允许把分类上级设置为自身子孙，避免分类树成环', async () => {
    const suffix = `${Date.now()}2`
    const { rootId, childId } = seedCategoryTree(db, suffix)

    const res = await request(app)
      .put(`/api/v1/categories/${rootId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `CG${suffix}00`,
        name: '分类守卫根',
        parentId: childId,
        level: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('descendant')
    const root = db.prepare('SELECT parent_id, level FROM material_categories WHERE id = ?').get(rootId) as any
    expect(root.parent_id).toBeNull()
    expect(Number(root.level)).toBe(1)
  })

  it('CAT-GUARD-003: 移动子树时同步子分类层级', async () => {
    const suffix = `${Date.now()}3`
    const { childId, grandchildId } = seedCategoryTree(db, suffix)

    const res = await request(app)
      .put(`/api/v1/categories/${childId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `CG${suffix}01`,
        name: '分类守卫子',
        parentId: null,
        level: 2,
      })

    expect(res.status).toBe(200)
    const child = db.prepare('SELECT parent_id, level FROM material_categories WHERE id = ?').get(childId) as any
    const grandchild = db.prepare('SELECT parent_id, level FROM material_categories WHERE id = ?').get(grandchildId) as any
    expect(child.parent_id).toBeNull()
    expect(Number(child.level)).toBe(1)
    expect(grandchild.parent_id).toBe(childId)
    expect(Number(grandchild.level)).toBe(2)
  })

  it('CAT-GUARD-004: 创建分类时层级必须与上级分类匹配', async () => {
    const suffix = `${Date.now()}4`
    const { rootId } = seedCategoryTree(db, suffix)

    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '错误层级分类',
        parentId: rootId,
        level: 1,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('层级')
  })

  it('CAT-TEXT-001: 创建和更新分类时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '<script>alert(1)</script>',
        level: 1,
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM material_categories WHERE name = ?')
      .get('<script>alert(1)</script>') as any).count
    expect(dirtyCount).toBe(0)

    const created = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `B194${String(Date.now()).slice(-6)}`,
        name: `  B194 安全分类 ${suffix}  `,
        level: 1,
      })

    expect(created.status).toBe(201)
    const safeRow = db.prepare('SELECT name FROM material_categories WHERE id = ?')
      .get(created.body.data.id) as any
    expect(safeRow.name).toBe(`B194 安全分类 ${suffix}`)

    const blockedUpdate = await request(app)
      .put(`/api/v1/categories/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: created.body.data.code,
        name: "' OR '1'='1",
        parentId: null,
        level: 1,
      })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT name FROM material_categories WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.name).toBe(`B194 安全分类 ${suffix}`)
  })

  it('CAT-DELETE-001: 有子分类的分类不可删除', async () => {
    const suffix = `${Date.now()}5`
    const { rootId, childId } = seedCategoryTree(db, suffix)

    const res = await request(app)
      .delete(`/api/v1/categories/${rootId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const root = db.prepare('SELECT is_deleted FROM material_categories WHERE id = ?').get(rootId) as any
    const child = db.prepare('SELECT parent_id, is_deleted FROM material_categories WHERE id = ?').get(childId) as any
    expect(Number(root.is_deleted)).toBe(0)
    expect(child.parent_id).toBe(rootId)
    expect(Number(child.is_deleted)).toBe(0)
  })

  it('CAT-DELETE-002: 有关联物料的分类不可通过迁移目标删除', async () => {
    const suffix = `${Date.now()}6`
    const { grandchildId, otherRootId } = seedCategoryTree(db, suffix)
    const materialId = `cat-guard-material-${suffix}`
    db.prepare(`
      INSERT INTO materials (id, code, name, unit, category_id)
      VALUES (?, ?, ?, '瓶', ?)
    `).run(materialId, `CAT-GUARD-MAT-${suffix}`, '分类删除保护物料', grandchildId)

    const res = await request(app)
      .delete(`/api/v1/categories/${grandchildId}`)
      .query({ targetCategoryId: otherRootId })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const category = db.prepare('SELECT is_deleted FROM material_categories WHERE id = ?').get(grandchildId) as any
    const material = db.prepare('SELECT category_id FROM materials WHERE id = ?').get(materialId) as any
    expect(Number(category.is_deleted)).toBe(0)
    expect(material.category_id).toBe(grandchildId)
  })
})
