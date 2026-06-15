import { DatabaseSync } from 'node:sqlite'
import { v4 as uuidv4 } from 'uuid'

const db = new DatabaseSync('/app/data/coreone.db')
db.exec('PRAGMA foreign_keys = ON')

// ========== 1. 定义新分类体系（基于真实病理实验室 IHC 耗材管理规范） ==========

interface CategoryDef {
  code: string
  name: string
  parentCode: string | null
  level: number
  sortOrder: number
}

const newCategories: CategoryDef[] = [
  // 一级分类
  { code: '100', name: '免疫组化试剂', parentCode: null, level: 1, sortOrder: 1 },
  { code: '200', name: '常规染色试剂', parentCode: null, level: 1, sortOrder: 2 },
  { code: '300', name: '组织处理试剂', parentCode: null, level: 1, sortOrder: 3 },
  { code: '400', name: '分子病理试剂', parentCode: null, level: 1, sortOrder: 4 },
  { code: '500', name: '玻片与镜检耗材', parentCode: null, level: 1, sortOrder: 5 },
  { code: '600', name: '实验室通用耗材', parentCode: null, level: 1, sortOrder: 6 },
  { code: '700', name: '设备与办公耗材', parentCode: null, level: 1, sortOrder: 7 },
  { code: '800', name: '安全防护用品', parentCode: null, level: 1, sortOrder: 8 },
  { code: '900', name: '质控与对照品', parentCode: null, level: 1, sortOrder: 9 },

  // 二级：免疫组化试剂
  { code: '101', name: '一抗', parentCode: '100', level: 2, sortOrder: 1 },
  { code: '102', name: '二抗与检测系统', parentCode: '100', level: 2, sortOrder: 2 },
  { code: '103', name: '显色与荧光试剂', parentCode: '100', level: 2, sortOrder: 3 },
  { code: '104', name: '抗原修复与封闭', parentCode: '100', level: 2, sortOrder: 4 },
  { code: '105', name: '缓冲液与清洗液', parentCode: '100', level: 2, sortOrder: 5 },
  { code: '106', name: '复染与封片', parentCode: '100', level: 2, sortOrder: 6 },
  { code: '107', name: '其他辅助试剂', parentCode: '100', level: 2, sortOrder: 7 },

  // 二级：常规染色试剂
  { code: '201', name: 'HE染色', parentCode: '200', level: 2, sortOrder: 1 },
  { code: '202', name: '细胞学染色', parentCode: '200', level: 2, sortOrder: 2 },

  // 二级：组织处理试剂
  { code: '301', name: '固定液', parentCode: '300', level: 2, sortOrder: 1 },
  { code: '302', name: '脱蜡与透明', parentCode: '300', level: 2, sortOrder: 2 },
  { code: '303', name: '包埋耗材', parentCode: '300', level: 2, sortOrder: 3 },

  // 二级：分子病理试剂
  { code: '401', name: '核酸提取', parentCode: '400', level: 2, sortOrder: 1 },
  { code: '402', name: 'PCR与测序', parentCode: '400', level: 2, sortOrder: 2 },
  { code: '403', name: 'FISH探针', parentCode: '400', level: 2, sortOrder: 3 },

  // 二级：玻片与镜检耗材
  { code: '501', name: '载玻片', parentCode: '500', level: 2, sortOrder: 1 },
  { code: '502', name: '盖玻片', parentCode: '500', level: 2, sortOrder: 2 },
  { code: '503', name: '切片刀具与辅助', parentCode: '500', level: 2, sortOrder: 3 },

  // 二级：实验室通用耗材
  { code: '601', name: '移液耗材', parentCode: '600', level: 2, sortOrder: 1 },
  { code: '602', name: '离心与PCR耗材', parentCode: '600', level: 2, sortOrder: 2 },
  { code: '603', name: '通用实验耗材', parentCode: '600', level: 2, sortOrder: 3 },

  // 二级：设备与办公耗材
  { code: '701', name: '设备专用耗材', parentCode: '700', level: 2, sortOrder: 1 },
  { code: '702', name: '标签与色带', parentCode: '700', level: 2, sortOrder: 2 },

  // 二级：安全防护用品
  { code: '801', name: '个人防护用品', parentCode: '800', level: 2, sortOrder: 1 },
  { code: '802', name: '应急用品', parentCode: '800', level: 2, sortOrder: 2 },

  // 二级：质控与对照品
  { code: '901', name: '质控品与对照', parentCode: '900', level: 2, sortOrder: 1 },
]

// ========== 2. 彻底删除旧分类 ==========

console.log('Deleting old categories...')
const deletedOld = db.prepare('DELETE FROM material_categories').run()
console.log(`Deleted ${deletedOld.changes} old categories`)

// 重置 SQLite 自增序列（如有）
try {
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'material_categories'").run()
} catch (_e) { /* sqlite_sequence 可能不存在 */ }

// ========== 3. 插入新分类 ==========

const insertCat = db.prepare(`
  INSERT INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at, is_deleted)
  VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
`)

const codeToId = new Map<string, string>()

// 先插入一级分类（无 parent）
for (const cat of newCategories.filter(c => c.parentCode === null)) {
  const id = uuidv4()
  codeToId.set(cat.code, id)
  insertCat.run(id, cat.code, cat.name, null, cat.level, cat.sortOrder)
  console.log(`Inserted L1: ${cat.name} (${cat.code})`)
}

// 再插入二级分类（有 parent）
for (const cat of newCategories.filter(c => c.parentCode !== null)) {
  const id = uuidv4()
  const parentId = codeToId.get(cat.parentCode!)
  if (!parentId) {
    console.error(`Parent not found for ${cat.code}: ${cat.parentCode}`)
    continue
  }
  codeToId.set(cat.code, id)
  insertCat.run(id, cat.code, cat.name, parentId, cat.level, cat.sortOrder)
  console.log(`Inserted L2: ${cat.name} (${cat.code})`)
}

// ========== 4. 物料映射规则 ==========

// 按物料编码前缀精确映射（优先级最高）
const prefixRules: { pattern: RegExp; catCode: string }[] = [
  // IHC 一抗：001-096, 118（同型对照本质也是抗体）
  { pattern: /^IHC-0([0-8][0-9]|9[0-6])$/, catCode: '101' },
  { pattern: /^IHC-118$/, catCode: '101' },

  // IHC 二抗与检测系统
  { pattern: /^IHC-09[78]$/, catCode: '102' },
  { pattern: /^IHC-099$/, catCode: '102' },
  { pattern: /^IHC-100$/, catCode: '102' },
  { pattern: /^IHC-120$/, catCode: '102' },

  // IHC 显色与荧光试剂
  { pattern: /^IHC-10[1234]$/, catCode: '103' },
  { pattern: /^IHC-105$/, catCode: '103' }, // 荧光标记二抗

  // IHC 抗原修复与封闭
  { pattern: /^IHC-10[67]$/, catCode: '104' }, // EDTA修复液、柠檬酸修复液
  { pattern: /^IHC-11[012345]$/, catCode: '104' }, // Tris-EDTA、胃蛋白酶、胰蛋白酶
  { pattern: /^IHC-111$/, catCode: '104' }, // 正常山羊血清封闭液

  // IHC 缓冲液与清洗液
  { pattern: /^IHC-112$/, catCode: '105' }, // PBS
  { pattern: /^IHC-113$/, catCode: '105' }, // TBST
  { pattern: /^IHC-114$/, catCode: '105' }, // Tween-20

  // IHC 复染与封片
  { pattern: /^IHC-119$/, catCode: '106' }, // 苏木素复染液

  // IHC 其他辅助试剂
  { pattern: /^IHC-121$/, catCode: '107' }, // 内源性生物素阻断剂
  { pattern: /^IHC-122$/, catCode: '107' }, // 抗体稀释液
  { pattern: /^IHC-115$/, catCode: '107' }, // Tween-20（也可放缓冲液）

  // HE 染色
  { pattern: /^HE-001$/, catCode: '201' }, // 苏木素染液
  { pattern: /^HE-002$/, catCode: '201' }, // 伊红染液
  { pattern: /^HE-003$/, catCode: '201' }, // 盐酸乙醇分化液
  { pattern: /^HE-004$/, catCode: '201' }, // 氨水返蓝液
  { pattern: /^HE-005$/, catCode: '201' }, // 无水乙醇
  { pattern: /^HE-007$/, catCode: '201' }, // 二甲苯
  { pattern: /^HE-009$/, catCode: '201' }, // 中性树胶

  // 组织处理
  { pattern: /^HE-008$/, catCode: '303' }, // 石蜡 → 包埋耗材
  { pattern: /^FIX-/, catCode: '301' },

  // 细胞学
  { pattern: /^CYTO-/, catCode: '202' },

  // 分子病理
  { pattern: /^MP-001$/, catCode: '401' },
  { pattern: /^MP-002$/, catCode: '401' },
  { pattern: /^MP-003$/, catCode: '401' },
  { pattern: /^MP-004$/, catCode: '402' },
  { pattern: /^MP-005$/, catCode: '402' },
  { pattern: /^MP-006$/, catCode: '402' },
  { pattern: /^MP-007$/, catCode: '402' },
  { pattern: /^MP-010$/, catCode: '402' },
  { pattern: /^MP-008$/, catCode: '403' },
  { pattern: /^MP-009$/, catCode: '403' },

  // 玻片与镜检
  { pattern: /^GLASS-001$/, catCode: '501' },
  { pattern: /^GLASS-002$/, catCode: '501' },
  { pattern: /^IHC-123$/, catCode: '501' }, // 防脱载玻片
  { pattern: /^GLASS-003$/, catCode: '502' },
  { pattern: /^GLASS-004$/, catCode: '502' },
  { pattern: /^GLASS-005$/, catCode: '503' }, // 不锈钢包埋盒
  { pattern: /^GLASS-006$/, catCode: '503' }, // 塑料包埋盒
  { pattern: /^GLASS-007$/, catCode: '503' }, // 载玻片架
  { pattern: /^DEV-001$/, catCode: '503' }, // 切片刀片
  { pattern: /^DEV-002$/, catCode: '503' }, // 切片刀片

  // 实验室通用耗材
  { pattern: /^LAB-001$/, catCode: '601' }, // 10ul吸头
  { pattern: /^LAB-002$/, catCode: '601' }, // 200ul吸头
  { pattern: /^LAB-003$/, catCode: '601' }, // 1000ul吸头
  { pattern: /^LAB-004$/, catCode: '602' }, // 1.5ml离心管
  { pattern: /^LAB-005$/, catCode: '602' }, // 15ml离心管
  { pattern: /^LAB-006$/, catCode: '602' }, // PCR管
  { pattern: /^LAB-007$/, catCode: '602' }, // PCR板
  { pattern: /^LAB-011$/, catCode: '602' }, // 丁腈手套中号
  { pattern: /^LAB-012$/, catCode: '602' }, // 丁腈手套大号
  { pattern: /^LAB-010$/, catCode: '602' }, // 丁腈手套小号
  { pattern: /^LAB-008$/, catCode: '603' }, // 称量纸
  { pattern: /^LAB-009$/, catCode: '603' }, // 滤纸

  // 设备与办公
  { pattern: /^DEV-003$/, catCode: '701' }, // 染色架
  { pattern: /^DEV-004$/, catCode: '701' }, // 盖玻片夹
  { pattern: /^DEV-005$/, catCode: '702' }, // 色带
  { pattern: /^DEV-006$/, catCode: '702' }, // 标签纸

  // 安全防护
  { pattern: /^SAFE-001$/, catCode: '801' },
  { pattern: /^SAFE-002$/, catCode: '801' },
  { pattern: /^SAFE-003$/, catCode: '801' },
  { pattern: /^SAFE-004$/, catCode: '801' },
  { pattern: /^SAFE-005$/, catCode: '802' }, // 急救包

  // 质控
  { pattern: /^IHC-116$/, catCode: '901' }, // 多组织阳性对照
  { pattern: /^IHC-117$/, catCode: '901' }, // IHC质控品套装
]

function getCategoryCode(materialCode: string, _materialName: string): string | null {
  for (const rule of prefixRules) {
    if (rule.pattern.test(materialCode)) return rule.catCode
  }
  return null
}

// ========== 5. 更新物料分类 ==========

const materials = db.prepare('SELECT id, code, name FROM materials WHERE is_deleted = 0').all() as any[]

const updateStmt = db.prepare('UPDATE materials SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
let updated = 0
const unmatched: string[] = []

for (const m of materials) {
  const catCode = getCategoryCode(m.code, m.name)
  if (catCode) {
    const catId = codeToId.get(catCode)
    if (catId) {
      updateStmt.run(catId, m.id)
      updated++
    } else {
      unmatched.push(`${m.code} ${m.name} → ${catCode} (ID not found)`)
    }
  } else {
    unmatched.push(`${m.code} ${m.name}`)
  }
}

console.log(`\nUpdated ${updated}/${materials.length} materials`)

if (unmatched.length > 0) {
  console.log(`\nUnmatched materials (${unmatched.length}):`)
  unmatched.forEach(u => console.log(`  ${u}`))
}

// ========== 6. 验证结果 ==========

console.log('\n--- Verification ---')
const verify = db.prepare(`
  SELECT mc.name as cat_name, COUNT(m.id) as count
  FROM material_categories mc
  LEFT JOIN materials m ON m.category_id = mc.id AND m.is_deleted = 0
  WHERE mc.is_deleted = 0
  GROUP BY mc.id
  ORDER BY mc.code
`).all() as any[]

for (const row of verify) {
  console.log(`  ${row.cat_name}: ${row.count} materials`)
}

db.close()
console.log('\nDone.')
