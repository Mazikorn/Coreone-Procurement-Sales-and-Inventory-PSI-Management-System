/**
 * BOM 收费映射回填（幂等）—— 让出库收入按真实病理计费可算。
 *
 * 真实病理计费构成：标本处理/制片费 + 染色/检测费(按片或按例) + 病理诊断费(按例阶梯)。
 * 一个 BOM 可挂多条 fee_standard（new bom_fee_mappings 表，引擎 getFeeMappings 优先读它）。
 * 仅为无映射的 BOM 补，故可安全在既有库重复运行。
 *
 * 用法：npx tsx scripts/seed-bom-fee-mappings.ts
 */

import { getDatabase } from '../src/database/DatabaseManager.js'
import { v4 as uuidv4 } from 'uuid'

// BOM 类型 → 收费构成（category + 聚合口径）。诊断按病例(case)聚合走阶梯封顶；其余按出库(片/标本)。
const TYPE_FEES: Record<string, Array<{ category: string; scope: 'outbound' | 'case' }>> = {
  he: [{ category: 'specimen常规', scope: 'outbound' }, { category: 'diagnosis', scope: 'case' }],
  ihc: [{ category: 'specimen常规', scope: 'outbound' }, { category: 'ihc', scope: 'outbound' }, { category: 'diagnosis', scope: 'case' }],
  ss: [{ category: 'specimen常规', scope: 'outbound' }, { category: 'ss', scope: 'outbound' }, { category: 'diagnosis', scope: 'case' }],
  mp: [{ category: 'mp_specimen', scope: 'outbound' }, { category: 'pcr', scope: 'outbound' }, { category: 'diagnosis', scope: 'case' }],
  cyto: [{ category: 'cyto_specimen', scope: 'outbound' }, { category: 'diagnosis', scope: 'case' }],
}

export function seedBomFeeMappings(database?: any): Record<string, number> {
  const db = database || getDatabase()
  const active = `(fs.status = 1 OR fs.status = 'active')`

  // 每 category 选一个代表收费标准：
  //  - ihc 取 fee_per_slide>0 的（按片计 ¥73），否则按 base_price 升序取常规项（避开高价特例如 open活检/ngs）
  //  - diagnosis 取 ¥105 的「病理诊断费（10张以内）」012100000010000
  const rows = db.prepare(`SELECT id, code, category, base_price, fee_per_slide FROM fee_standards fs WHERE ${active}`).all() as any[]
  const feeByCat = new Map<string, string>()
  const pick = (cat: string, prefer?: (r: any) => boolean) => {
    const cands = rows.filter(r => r.category === cat)
    if (!cands.length) return null
    const p = prefer ? cands.find(prefer) : null
    const chosen = p || cands.slice().sort((a, b) => Number(a.base_price) - Number(b.base_price))[0]
    return chosen?.id || null
  }
  for (const cat of ['specimen常规', 'ihc', 'ss', 'pcr', 'mp_specimen', 'cyto_specimen']) {
    const id = cat === 'ihc' ? pick('ihc', r => Number(r.fee_per_slide) > 0) : pick(cat)
    if (id) feeByCat.set(cat, id)
  }
  const diag = rows.find(r => r.code === '012100000010000') || rows.find(r => r.category === 'diagnosis')
  if (diag) feeByCat.set('diagnosis', diag.id)

  const boms = db.prepare('SELECT id, type FROM boms WHERE is_deleted = 0').all() as any[]
  const hasMap = db.prepare('SELECT 1 FROM bom_fee_mappings WHERE bom_id = ? LIMIT 1')
  const ins = db.prepare(
    `INSERT INTO bom_fee_mappings (id, bom_id, fee_standard_id, quantity_multiplier, aggregation_scope, sort_order, status)
     VALUES (?, ?, ?, 1, ?, ?, 'active')`
  )
  const stats = { added: 0, bomsMapped: 0 }
  for (const bom of boms) {
    if (hasMap.get(bom.id)) continue
    const fees = TYPE_FEES[String(bom.type || '').toLowerCase()] || TYPE_FEES['ihc']
    let order = 0
    let n = 0
    for (const f of fees) {
      const fsId = feeByCat.get(f.category)
      if (!fsId) continue
      ins.run(uuidv4(), bom.id, fsId, f.scope, order++)
      stats.added++; n++
    }
    if (n > 0) stats.bomsMapped++
  }
  return stats
}

const isMain = process.argv[1] && process.argv[1].includes('seed-bom-fee-mappings')
if (isMain) {
  console.log('BOM 收费映射回填完成：', JSON.stringify(seedBomFeeMappings()))
}
