/**
 * 生成中型病理实验室真实月度（2026-06）出库（成本层）—— 直接建 outbound_records，再由重算写 ABC 快照。
 *
 * 取舍：经真实出库 API 会触发库存/批次/库位逐层消耗（演示库未铺库位余量，且 BOM 材料单价存在
 * 单位错配致虚高），故这里只生成「成本层」：真实病理占比 + 真实 case_no(病理号) + 领域口径的每样本材料成本，
 * 让重算产出真实 ABC（固定间接 ¥65k 摊到真实切片量级 → 单片成本/毛利回归合理）。
 * 库存模块不追踪这些合成病例（既有 15 笔真实出库仍完全一致）。
 *
 * 用法：npx tsx scripts/gen-realistic-month.ts [总笔数=80]（后端须停，避免 DB 写冲突）
 */

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data', 'coreone.db')

// 真实病种占比（目标笔数，合计≈80）
const TYPE_TARGET: Record<string, number> = { ihc: 50, he: 8, ss: 8, mp: 8, cyto: 6 }
// 各类型每样本材料成本（领域口径：抗体/试剂实际单价级，规避演示库 BOM 单位错配的虚高 ¥1400+）
const PER_SAMPLE_MATERIAL: Record<string, number> = { he: 25, ihc: 210, ss: 48, mp: 620, cyto: 55 }
const SAMPLE_DIST = [1, 1, 1, 1, 2, 2, 3]

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }

function main() {
  const total = Number(process.argv[2]) || 80
  const db = new DatabaseSync(dbPath)

  // 有效项目池（项目活跃 + BOM 存在/活跃/类型匹配，与出库口径一致）
  const byType: Record<string, string[]> = {}
  for (const r of db.prepare(`
    SELECT p.id, p.type FROM projects p
    JOIN boms b ON b.id = p.bom_id AND b.is_deleted = 0 AND b.status = 1
    WHERE p.is_deleted = 0 AND p.status = 1 AND (b.type = p.type OR b.type = 'project')
  `).all() as any[]) {
    const t = String(r.type || '').toLowerCase()
    ;(byType[t] = byType[t] || []).push(r.id)
  }

  const tasks: Array<{ type: string; projectId: string }> = []
  for (const [type, want] of Object.entries(TYPE_TARGET)) {
    const pool = byType[type] || []
    if (!pool.length) continue
    const n = Math.round((want / 80) * total)
    for (let i = 0; i < n; i++) tasks.push({ type, projectId: pick(pool, i) })
  }

  const ins = db.prepare(`
    INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, case_no, operator, status, remark, cost_status, created_at, updated_at)
    VALUES (?, ?, 'bom', ?, ?, ?, ?, 'admin', 'completed', ?, 'pending_cost', ?, ?)
  `)
  let n = 0
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const caseNo = `BL2026-06-${String(i + 1).padStart(4, '0')}` // 病理号
    const sampleCount = pick(SAMPLE_DIST, i * 3 + 1)
    const matPerSample = PER_SAMPLE_MATERIAL[t.type] ?? 150
    const totalCost = Math.round(matPerSample * sampleCount * 100) / 100
    const day = String((i % 26) + 1).padStart(2, '0')
    const ts = `2026-06-${day} ${String(8 + (i % 9)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`
    ins.run(uuidv4(), `OB-RM-${String(i + 1).padStart(4, '0')}`, t.projectId, totalCost, sampleCount, caseNo, `真实月度演示 ${t.type}`, ts, ts)
    n++
  }
  const byT: Record<string, number> = {}
  for (const t of tasks) byT[t.type] = (byT[t.type] || 0) + 1
  console.log(`生成 ${n} 笔成本层出库（2026-06）`, JSON.stringify(byT))
}

main()
