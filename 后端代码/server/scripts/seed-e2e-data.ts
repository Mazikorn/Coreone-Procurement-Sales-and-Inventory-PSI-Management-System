/**
 * 系统数据初始化脚本
 * 基于当前数据库 schema 创建完整的业务数据
 */

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data', 'coreone.db')

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return Number((Math.random() * (max - min) + min).toFixed(decimals))
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function seedE2EData() {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')

  const now = new Date().toISOString()
  const userId = 'USER-001' // admin

  console.log('开始初始化系统数据...\n')

  // ============================================
  // 1. 用户数据 (如不存在)
  // ============================================
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count
  if (userCount === 0) {
    console.log('【1/10】创建用户...')
    const users = [
      { id: 'USER-001', username: 'admin', password: 'CoreOne2026!', realName: '系统管理员', role: 'admin' },
      { id: 'USER-002', username: 'wangkq', password: 'CoreOne2026!', realName: '王坤强', role: 'warehouse_manager' },
      { id: 'USER-003', username: 'zhangwei', password: 'CoreOne2026!', realName: '张伟', role: 'technician' },
      { id: 'USER-004', username: 'liuyf', password: 'CoreOne2026!', realName: '刘玉芬', role: 'pathologist' },
      { id: 'USER-005', username: 'zhaohp', password: 'CoreOne2026!', realName: '赵慧萍', role: 'procurement' },
      { id: 'USER-006', username: 'sunli', password: 'CoreOne2026!', realName: '孙丽', role: 'finance' },
    ]

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password, real_name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `)

    for (const u of users) {
      const hashedPassword = await bcrypt.hash(u.password, 10)
      insertUser.run(u.id, u.username, hashedPassword, u.realName, u.role, now, now)
    }
    console.log(`  创建 ${users.length} 个用户`)
  } else {
    console.log(`【1/10】用户已存在 (${userCount} 个)，跳过`)
  }

  // ============================================
  // 2. 供应商数据
  // ============================================
  const supplierCount = (db.prepare('SELECT COUNT(*) as count FROM suppliers WHERE is_deleted = 0').get() as any).count
  if (supplierCount === 0) {
    console.log('【2/10】创建供应商...')
    const suppliers = [
      { code: 'SUP-001', name: '罗氏诊断产品(上海)有限公司', contact: '张建国', phone: '021-28918800', email: 'zhang.jianguo@roche.com', address: '上海市浦东新区外高桥保税区' },
      { code: 'SUP-002', name: '迈瑞医疗国际股份有限公司', contact: '李明辉', phone: '0755-81234567', email: 'li.minghui@mindray.com', address: '深圳市南山区高新技术产业园区' },
      { code: 'SUP-003', name: '安捷伦科技(中国)有限公司', contact: '王志强', phone: '010-64321098', email: 'wang.zhiqiang@agilent.com', address: '北京市朝阳区望京科技园' },
      { code: 'SUP-004', name: '赛默飞世尔科技(中国)有限公司', contact: '赵德亮', phone: '021-38726600', email: 'zhao.delian@thermofisher.com', address: '上海市浦东新区金桥出口加工区' },
      { code: 'SUP-005', name: 'Leica Biosystems (上海)', contact: '孙志勇', phone: '021-54321098', email: 'sun.zhiyong@leica.com', address: '上海市闵行区莘庄工业区' },
      { code: 'SUP-006', name: 'DAKO (安捷伦病理诊断)', contact: '周翔', phone: '021-58883200', email: 'zhou.xiang@dako.com', address: '上海市浦东新区张江高科技园区' },
    ]

    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (id, code, name, contact, phone, email, address, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `)

    const supplierIds: string[] = []
    for (const s of suppliers) {
      const id = uuidv4()
      supplierIds.push(id)
      insertSupplier.run(id, s.code, s.name, s.contact, s.phone, s.email, s.address, now, now, userId)
    }
    console.log(`  创建 ${suppliers.length} 个供应商`)
  } else {
    console.log(`【2/10】供应商已存在 (${supplierCount} 个)，跳过`)
  }

  // ============================================
  // 3. 分类数据 (三级分类)
  // ============================================
  const catCount = (db.prepare('SELECT COUNT(*) as count FROM material_categories WHERE is_deleted = 0').get() as any).count
  if (catCount === 0) {
    console.log('【3/10】创建三级分类...')
    const categories = [
      // 一级分类
      { code: 'CAT-01', name: '免疫组化试剂', level: 1, children: [
        { code: 'CAT-01-01', name: '一抗', level: 2, children: [
          { code: 'CAT-01-01-01', name: '上皮标记', level: 3 },
          { code: 'CAT-01-01-02', name: '间叶标记', level: 3 },
          { code: 'CAT-01-01-03', name: '神经标记', level: 3 },
          { code: 'CAT-01-01-04', name: '淋巴瘤标记', level: 3 },
          { code: 'CAT-01-01-05', name: '肿瘤相关标记', level: 3 },
        ]},
        { code: 'CAT-01-02', name: '二抗/检测试剂盒', level: 2, children: [
          { code: 'CAT-01-02-01', name: 'EnVision 试剂盒', level: 3 },
          { code: 'CAT-01-02-02', name: 'SP 试剂盒', level: 3 },
        ]},
        { code: 'CAT-01-03', name: '显色系统', level: 2, children: [
          { code: 'CAT-01-03-01', name: 'DAB 显色液', level: 3 },
          { code: 'CAT-01-03-02', name: 'AEC 显色液', level: 3 },
        ]},
      ]},
      { code: 'CAT-02', name: '分子病理试剂', level: 1, children: [
        { code: 'CAT-02-01', name: 'FISH 探针', level: 2, children: [
          { code: 'CAT-02-01-01', name: 'HER2 探针', level: 3 },
          { code: 'CAT-02-01-02', name: 'ALK 探针', level: 3 },
        ]},
        { code: 'CAT-02-02', name: 'PCR 试剂', level: 2, children: [
          { code: 'CAT-02-02-01', name: '基因突变检测试剂盒', level: 3 },
        ]},
      ]},
      { code: 'CAT-03', name: '耗材', level: 1, children: [
        { code: 'CAT-03-01', name: '载玻片', level: 2, children: [
          { code: 'CAT-03-01-01', name: '普通载玻片', level: 3 },
          { code: 'CAT-03-01-02', name: '防脱载玻片', level: 3 },
        ]},
        { code: 'CAT-03-02', name: '盖玻片', level: 2, children: [
          { code: 'CAT-03-02-01', name: '盖玻片', level: 3 },
        ]},
        { code: 'CAT-03-03', name: '包埋盒', level: 2, children: [
          { code: 'CAT-03-03-01', name: '一次性包埋盒', level: 3 },
        ]},
      ]},
      { code: 'CAT-04', name: '质控品', level: 1, children: [
        { code: 'CAT-04-01', name: '阳性对照', level: 2, children: [
          { code: 'CAT-04-01-01', name: '组织芯片', level: 3 },
        ]},
      ]},
    ]

    const insertCat = db.prepare(`
      INSERT INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `)

    let catCount = 0
    const insertCategories = (cats: any[], parentId: string | null = null) => {
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i]
        const id = uuidv4()
        insertCat.run(id, cat.code, cat.name, parentId, cat.level, i + 1, now, now, userId)
        catCount++
        if (cat.children) {
          insertCategories(cat.children, id)
        }
      }
    }
    insertCategories(categories)
    console.log(`  创建 ${catCount} 个分类`)
  } else {
    console.log(`【3/10】分类已存在 (${catCount} 个)，跳过`)
  }

  // ============================================
  // 4. 库位数据
  // ============================================
  const locCount = (db.prepare('SELECT COUNT(*) as count FROM locations WHERE is_deleted = 0').get() as any).count
  if (locCount === 0) {
    console.log('【4/10】创建库位...')
    const locations = [
      { code: 'LOC-A', name: 'A区-试剂冷藏柜', type: 'shelf', zone: 'A', shelf: 'A1', position: '1-5', capacity: 500 },
      { code: 'LOC-B', name: 'B区-试剂常温架', type: 'shelf', zone: 'B', shelf: 'B1', position: '1-3', capacity: 300 },
      { code: 'LOC-C', name: 'C区-耗材存放区', type: 'shelf', zone: 'C', shelf: 'C1', position: '1-10', capacity: 1000 },
      { code: 'LOC-D', name: 'D区-质控品冰箱', type: 'shelf', zone: 'D', shelf: 'D1', position: '1-2', capacity: 100 },
      { code: 'LOC-E', name: 'E区-危化品柜', type: 'shelf', zone: 'E', shelf: 'E1', position: '1-3', capacity: 50 },
    ]

    const insertLoc = db.prepare(`
      INSERT INTO locations (id, code, name, type, zone, shelf, position, capacity, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `)

    const locIds: string[] = []
    for (const l of locations) {
      const id = uuidv4()
      locIds.push(id)
      insertLoc.run(id, l.code, l.name, l.type, l.zone, l.shelf, l.position, l.capacity, now, now, userId)
    }
    console.log(`  创建 ${locations.length} 个库位`)
  } else {
    console.log(`【4/10】库位已存在 (${locCount} 个)，跳过`)
  }

  // ============================================
  // 5. 物料数据
  // ============================================
  const matCount = (db.prepare('SELECT COUNT(*) as count FROM materials WHERE is_deleted = 0').get() as any).count
  if (matCount === 0) {
    console.log('【5/10】创建物料...')
    // 获取分类和供应商 ID
    const cats = db.prepare('SELECT id, code, name FROM material_categories WHERE level = 3 AND is_deleted = 0').all() as any[]
    const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE is_deleted = 0').all() as any[]
    const locations = db.prepare('SELECT id, name FROM locations WHERE is_deleted = 0').all() as any[]

    const materials = [
      // 免疫组化试剂 - 一抗
      { code: 'MAT-001', name: 'Anti-Pan CK (AE1/AE3)', spec: '浓缩型 0.1ml', unit: '支', price: 850, minStock: 10, catCode: 'CAT-01-01-01' },
      { code: 'MAT-002', name: 'Anti-Vimentin', spec: '即用型 6ml', unit: '瓶', price: 680, minStock: 8, catCode: 'CAT-01-01-02' },
      { code: 'MAT-003', name: 'Anti-S-100', spec: '浓缩型 0.1ml', unit: '支', price: 920, minStock: 5, catCode: 'CAT-01-01-03' },
      { code: 'MAT-004', name: 'Anti-CD20 (L26)', spec: '即用型 6ml', unit: '瓶', price: 750, minStock: 8, catCode: 'CAT-01-01-04' },
      { code: 'MAT-005', name: 'Anti-Ki-67 (MIB-1)', spec: '即用型 6ml', unit: '瓶', price: 780, minStock: 10, catCode: 'CAT-01-01-05' },
      { code: 'MAT-006', name: 'Anti-HER2 (4B5)', spec: '即用型 6ml', unit: '瓶', price: 1200, minStock: 6, catCode: 'CAT-01-01-05' },
      { code: 'MAT-007', name: 'Anti-ER (SP1)', spec: '即用型 6ml', unit: '瓶', price: 980, minStock: 8, catCode: 'CAT-01-01-05' },
      { code: 'MAT-008', name: 'Anti-PR (1E2)', spec: '即用型 6ml', unit: '瓶', price: 980, minStock: 8, catCode: 'CAT-01-01-05' },
      { code: 'MAT-009', name: 'Anti-P53 (DO-7)', spec: '即用型 6ml', unit: '瓶', price: 720, minStock: 6, catCode: 'CAT-01-01-05' },
      { code: 'MAT-010', name: 'Anti-ALK (D5F3)', spec: '即用型 6ml', unit: '瓶', price: 1500, minStock: 4, catCode: 'CAT-01-01-05' },
      // 免疫组化试剂 - 二抗/试剂盒
      { code: 'MAT-011', name: 'EnVision FLEX+ Rabbit', spec: '即用型 60测试', unit: '盒', price: 2800, minStock: 5, catCode: 'CAT-01-02-01' },
      { code: 'MAT-012', name: 'EnVision FLEX+ Mouse', spec: '即用型 60测试', unit: '盒', price: 2800, minStock: 5, catCode: 'CAT-01-02-01' },
      // 显色系统
      { code: 'MAT-013', name: 'DAB 显色液 (FLEX)', spec: '即用型 100ml', unit: '瓶', price: 450, minStock: 10, catCode: 'CAT-01-03-01' },
      { code: 'MAT-014', name: 'AEC 显色液', spec: '即用型 50ml', unit: '瓶', price: 380, minStock: 5, catCode: 'CAT-01-03-02' },
      // 分子病理
      { code: 'MAT-015', name: 'HER2 FISH 探针', spec: '10测试/盒', unit: '盒', price: 4500, minStock: 3, catCode: 'CAT-02-01-01' },
      { code: 'MAT-016', name: 'ALK FISH 探针', spec: '10测试/盒', unit: '盒', price: 4800, minStock: 3, catCode: 'CAT-02-01-02' },
      { code: 'MAT-017', name: 'EGFR 基因突变检测试剂盒', spec: '24测试/盒', unit: '盒', price: 8500, minStock: 2, catCode: 'CAT-02-02-01' },
      // 耗材
      { code: 'MAT-018', name: '普通载玻片', spec: '76×26mm 50片/盒', unit: '盒', price: 25, minStock: 50, catCode: 'CAT-03-01-01' },
      { code: 'MAT-019', name: '防脱载玻片', spec: '76×26mm 50片/盒', unit: '盒', price: 45, minStock: 50, catCode: 'CAT-03-01-02' },
      { code: 'MAT-020', name: '盖玻片 24×50mm', spec: '100片/盒', unit: '盒', price: 35, minStock: 30, catCode: 'CAT-03-02-01' },
      { code: 'MAT-021', name: '一次性包埋盒', spec: '50个/包', unit: '包', price: 28, minStock: 40, catCode: 'CAT-03-03-01' },
      // 质控品
      { code: 'MAT-022', name: '乳腺癌组织芯片 (阳性对照)', spec: '1芯片/盒', unit: '盒', price: 1200, minStock: 2, catCode: 'CAT-04-01-01' },
      { code: 'MAT-023', name: '肺癌组织芯片 (阳性对照)', spec: '1芯片/盒', unit: '盒', price: 1200, minStock: 2, catCode: 'CAT-04-01-01' },
      { code: 'MAT-024', name: '淋巴瘤组织芯片 (阳性对照)', spec: '1芯片/盒', unit: '盒', price: 1500, minStock: 2, catCode: 'CAT-04-01-01' },
    ]

    const insertMat = db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, min_stock, location_id, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `)

    const matIds: string[] = []
    for (const m of materials) {
      const cat = cats.find(c => c.code === m.catCode)
      if (!cat) continue
      const id = uuidv4()
      matIds.push(id)
      const supplier = suppliers.length > 0 ? pickRandom(suppliers) : null
      const location = locations.length > 0 ? pickRandom(locations) : null
      insertMat.run(id, m.code, m.name, m.spec, m.unit, cat.id, supplier?.id, m.price, m.minStock, location?.id, now, now, userId)
    }
    console.log(`  创建 ${matIds.length} 个物料`)
  } else {
    console.log(`【5/10】物料已存在 (${matCount} 个)，跳过`)
  }

  // ============================================
  // 6. 入库记录 + 库存
  // ============================================
  const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE is_deleted = 0').get() as any).count
  if (inboundCount === 0) {
    console.log('【6/10】创建入库记录和库存...')
    const materials = db.prepare('SELECT id, code, name, unit, price FROM materials WHERE is_deleted = 0').all() as any[]
    const suppliers = db.prepare('SELECT id FROM suppliers WHERE is_deleted = 0').all() as any[]
    const locations = db.prepare('SELECT id FROM locations WHERE is_deleted = 0').all() as any[]

    const insertInbound = db.prepare(`
      INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, price, amount, supplier_id, location_id, production_date, expiry_date, operator, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
    `)

    const insertBatch = db.prepare(`
      INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)

    const insertInventory = db.prepare(`
      INSERT INTO inventory (id, material_id, stock, location_id, last_inbound_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const updateInventory = db.prepare(`
      UPDATE inventory SET stock = stock + ?, last_inbound_date = ?, updated_at = ? WHERE material_id = ?
    `)

    let inboundNum = 1
    const startDate = new Date('2025-01-01')
    const endDate = new Date('2026-06-01')

    for (const mat of materials) {
      // 每个物料 2-4 次入库
      const inboundTimes = randomInt(2, 4)
      let totalStock = 0

      for (let i = 0; i < inboundTimes; i++) {
        const inboundId = uuidv4()
        const inboundNo = `IN-${String(inboundNum++).padStart(6, '0')}`
        const batchNo = `B${formatDate(randomDate(startDate, endDate)).replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`
        const quantity = randomInt(10, 100)
        const price = mat.price * (0.85 + Math.random() * 0.3) // 价格浮动
        const amount = quantity * price
        const supplier = suppliers.length > 0 ? pickRandom(suppliers) : null
        const location = locations.length > 0 ? pickRandom(locations) : null
        const inboundDate = randomDate(startDate, endDate)
        const prodDate = new Date(inboundDate.getTime() - randomInt(30, 180) * 24 * 60 * 60 * 1000)
        const expDate = new Date(inboundDate.getTime() + randomInt(180, 730) * 24 * 60 * 60 * 1000)

        insertInbound.run(
          inboundId, inboundNo, 'purchase', mat.id, batchNo, quantity, mat.unit,
          price.toFixed(2), amount.toFixed(2), supplier?.id, location?.id,
          formatDate(prodDate), formatDate(expDate), '张仓管',
          now, now, userId
        )

        insertBatch.run(
          uuidv4(), mat.id, batchNo, quantity, quantity,
          formatDate(prodDate), formatDate(expDate),
          inboundId, price.toFixed(2), supplier?.id,
          now, now
        )

        totalStock += quantity
      }

      // 创建库存记录
      const location = locations.length > 0 ? pickRandom(locations) : null
      insertInventory.run(
        uuidv4(), mat.id, totalStock, location?.id,
        formatDate(randomDate(new Date('2026-05-01'), new Date('2026-06-01'))),
        now, now
      )
    }
    console.log(`  创建 ${inboundNum - 1} 条入库记录和库存`)
  } else {
    console.log(`【6/10】入库记录已存在 (${inboundCount} 条)，跳过`)
  }

  // ============================================
  // 7. 出库记录
  // ============================================
  const outboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE is_deleted = 0').get() as any).count
  if (outboundCount === 0) {
    console.log('【7/10】创建出库记录...')
    const materials = db.prepare('SELECT id, code, name, unit FROM materials WHERE is_deleted = 0').all() as any[]
    const projects = db.prepare('SELECT id, name FROM projects WHERE is_deleted = 0').all() as any[]
    const locations = db.prepare('SELECT id FROM locations WHERE is_deleted = 0').all() as any[]

    const insertOutbound = db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, project_id, operator, status, remark, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)
    `)

    const insertOutboundItem = db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, batch_no, quantity, unit, cost_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateInventory = db.prepare(`
      UPDATE inventory SET stock = stock - ?, updated_at = ? WHERE material_id = ? AND stock >= ?
    `)

    let outboundNum = 1
    const project = projects.length > 0 ? projects[0] : null

    // 创建 20 条出库记录
    for (let i = 0; i < 20; i++) {
      const outboundId = uuidv4()
      const outboundNo = `OUT-${String(outboundNum++).padStart(6, '0')}`
      const outboundDate = randomDate(new Date('2025-06-01'), new Date('2026-06-01'))

      insertOutbound.run(
        outboundId, outboundNo, project?.id, '张伟',
        `常规领用-${project?.name || '检测项目'}`, outboundDate.toISOString(), outboundDate.toISOString(), userId
      )

      // 每条出库 1-3 个物料
      const itemCount = randomInt(1, 3)
      for (let j = 0; j < itemCount; j++) {
        const mat = pickRandom(materials)
        const quantity = randomInt(1, 10)

        insertOutboundItem.run(
          uuidv4(), outboundId, mat.id, `${mat.code}-B${String(i + 1).padStart(3, '0')}`,
          quantity, mat.unit, (Math.random() * 100 + 10).toFixed(2),
          outboundDate.toISOString(), outboundDate.toISOString()
        )

        // 更新库存
        updateInventory.run(quantity, now, mat.id, quantity)
      }
    }
    console.log(`  创建 ${outboundNum - 1} 条出库记录`)
  } else {
    console.log(`【7/10】出库记录已存在 (${outboundCount} 条)，跳过`)
  }

  // ============================================
  // 8. 盘点记录
  // ============================================
  const stocktakingCount = (db.prepare('SELECT COUNT(*) as count FROM stocktaking_records').get() as any).count
  if (stocktakingCount === 0) {
    console.log('【8/10】创建盘点记录...')
    const materials = db.prepare('SELECT id, name FROM materials WHERE is_deleted = 0 LIMIT 10').all() as any[]

    const insertStocktaking = db.prepare(`
      INSERT INTO stocktaking_records (id, stocktaking_no, status, operator, remark, created_at, updated_at, created_by)
      VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)
    `)

    // 创建 3 次盘点
    for (let i = 0; i < 3; i++) {
      const stId = uuidv4()
      const stNo = `ST-${String(i + 1).padStart(4, '0')}`
      const stDate = randomDate(new Date('2025-10-01'), new Date('2026-06-01'))

      const quarter = ['2025年Q4季度盘点', '2026年Q1季度盘点', '2026年Q2季度盘点']
      insertStocktaking.run(
        stId, stNo, '王坤强', quarter[i] || '月度盘点',
        stDate.toISOString(), stDate.toISOString(), userId
      )
    }
    console.log(`  创建 3 条盘点记录`)
  } else {
    console.log(`【8/10】盘点记录已存在 (${stocktakingCount} 条)，跳过`)
  }

  // ============================================
  // 9. 采购订单
  // ============================================
  const poCount = (db.prepare('SELECT COUNT(*) as count FROM purchase_orders WHERE is_deleted = 0').get() as any).count
  if (poCount === 0) {
    console.log('【9/10】创建采购订单...')
    const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE is_deleted = 0').all() as any[]
    const materials = db.prepare('SELECT id, code, name, unit, price FROM materials WHERE is_deleted = 0 LIMIT 10').all() as any[]

    const insertPO = db.prepare(`
      INSERT INTO purchase_orders (id, order_no, supplier_id, status, total_amount, remark, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // 创建 5 个采购订单
    const statuses = ['pending', 'approved', 'completed', 'pending', 'approved']
    for (let i = 0; i < 5; i++) {
      const poId = uuidv4()
      const poNo = `PO-${String(i + 1).padStart(6, '0')}`
      const supplier = pickRandom(suppliers)
      const totalAmount = randomFloat(5000, 50000)
      const poDate = randomDate(new Date('2026-01-01'), new Date('2026-06-01'))

      const poRemarks = ['常规试剂补货', 'IHC抗体采购', '分子诊断试剂采购', '耗材月度采购', '设备配件采购']
      insertPO.run(
        poId, poNo, supplier.id, statuses[i], totalAmount,
        poRemarks[i] || '常规采购', poDate.toISOString(), poDate.toISOString(), userId
      )
    }
    console.log(`  创建 5 条采购订单`)
  } else {
    console.log(`【9/10】采购订单已存在 (${poCount} 条)，跳过`)
  }

  // ============================================
  // 10. 预警记录
  // ============================================
  const alertCount = (db.prepare('SELECT COUNT(*) as count FROM alerts').get() as any).count
  if (alertCount === 0) {
    console.log('【10/10】创建预警记录...')
    const materials = db.prepare('SELECT id, name FROM materials WHERE is_deleted = 0 LIMIT 5').all() as any[]

    const insertAlert = db.prepare(`
      INSERT INTO alerts (id, type, material_id, title, message, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `)

    // 创建 5 条预警
    const alertTypes = ['low_stock', 'expiring', 'low_stock', 'overstock', 'expiring']
    const alertTitles = ['库存不足预警', '近效期预警', '库存不足预警', '库存过剩预警', '近效期预警']
    const alertMessages = ['库存低于安全库存', '将在30天内过期', '库存低于最低库存', '库存超过最大库存', '将在60天内过期']
    const priorities = ['high', 'medium', 'high', 'low', 'medium']

    for (let i = 0; i < 5; i++) {
      const alertDate = randomDate(new Date('2026-05-01'), new Date('2026-06-01'))
      insertAlert.run(
        uuidv4(), alertTypes[i], materials[i]?.id,
        alertTitles[i], `${materials[i]?.name}: ${alertMessages[i]}`,
        priorities[i], alertDate.toISOString(), alertDate.toISOString()
      )
    }
    console.log(`  创建 5 条预警记录`)
  } else {
    console.log(`【10/10】预警记录已存在 (${alertCount} 条)，跳过`)
  }

  // ============================================
  // 最终统计
  // ============================================
  console.log('\n=== 数据统计 ===')
  const stats = [
    ['用户', 'users'],
    ['供应商', 'suppliers WHERE is_deleted = 0'],
    ['分类', 'material_categories WHERE is_deleted = 0'],
    ['库位', 'locations WHERE is_deleted = 0'],
    ['物料', 'materials WHERE is_deleted = 0'],
    ['入库记录', 'inbound_records WHERE is_deleted = 0'],
    ['出库记录', 'outbound_records WHERE is_deleted = 0'],
    ['盘点记录', 'stocktaking_records'],
    ['采购订单', 'purchase_orders WHERE is_deleted = 0'],
    ['预警', 'alerts'],
    ['批次', 'batches'],
    ['库存', 'inventory'],
  ]

  for (const [name, table] of stats) {
    const count = (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any).count
    console.log(`  ${name}: ${count}`)
  }

  console.log('\n系统数据初始化完成')
}

seedE2EData().catch(console.error)
