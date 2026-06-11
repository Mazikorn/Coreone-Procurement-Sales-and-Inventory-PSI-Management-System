/**
 * BOM 收费标准映射种子数据
 * 根据 BOM 类型匹配收费标准，更新 fee_standard_id 和 fee_category
 * 并调用标准成本计算逻辑更新 standard_slide_cost, standard_fee_per_slide, standard_margin_rate
 */

import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { fileURLToPath } from 'url'
import { calculateSlideCostWithFee } from '../src/utils/cost-calculator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data', 'coreone.db')

// BOM 类型 → 收费标准映射规则
const bomFeeMappings = [
  // HE 染色 → 诊断费 + 标本处理费
  { bomType: 'he', feeCategory: 'diagnosis', feeStandardCode: '012100000010000' },
  // IHC 免疫组化 → IHC 检测费
  { bomType: 'ihc', feeCategory: 'ihc', feeStandardCode: '012100000120000' },
  // 特殊染色 → 特染费
  { bomType: 'ss', feeCategory: 'ss', feeStandardCode: '012100000110000' },
  // 分子病理 FISH → FISH 检测费
  { bomType: 'mp', feeCategory: 'fish', feeStandardCode: '012100000150000' },
  // 细胞病理 → 细胞标本处理费
  { bomType: 'cyto', feeCategory: 'cyto_specimen', feeStandardCode: '012100000050000' },
]

export function seedBomFeeMapping(): void {
  const db = new DatabaseSync(dbPath)

  console.log('=== BOM 收费标准映射 ===\n')

  let totalMapped = 0
  let totalSkipped = 0

  for (const mapping of bomFeeMappings) {
    console.log(`--- 处理 BOM 类型: ${mapping.bomType} → ${mapping.feeCategory} ---`)

    // 1. 从 fee_standards 表查找收费标准
    const feeStandard = db.prepare(`
      SELECT id, code, name, base_price FROM fee_standards WHERE code = ?
    `).get(mapping.feeStandardCode) as any

    if (!feeStandard) {
      console.warn(`  [警告] 收费标准 code=${mapping.feeStandardCode} 不存在，跳过`)
      totalSkipped++
      continue
    }
    console.log(`  收费标准: ${feeStandard.name} (id=${feeStandard.id})`)

    // 2. 从 boms 表查找匹配的 BOM
    const boms = db.prepare(`
      SELECT id, code, name, type FROM boms WHERE type = ? AND is_deleted = 0
    `).all(mapping.bomType) as any[]

    if (boms.length === 0) {
      console.warn(`  [警告] 没有找到 type=${mapping.bomType} 的 BOM，跳过`)
      totalSkipped++
      continue
    }
    console.log(`  找到 ${boms.length} 个 BOM`)

    // 3. 更新每个 BOM 的 fee_standard_id 和 fee_category
    const updateStmt = db.prepare(`
      UPDATE boms SET fee_standard_id = ?, fee_category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `)

    for (const bom of boms) {
      updateStmt.run(feeStandard.id, mapping.feeCategory, bom.id)
      console.log(`  [更新] ${bom.code} (${bom.name}) → fee_standard_id=${feeStandard.id}, fee_category=${mapping.feeCategory}`)
    }

    // 4. 调用标准成本计算逻辑更新 standard_slide_cost, standard_fee_per_slide, standard_margin_rate
    const currentMonth = new Date().toISOString().slice(0, 7)
    for (const bom of boms) {
      try {
        const result = calculateSlideCostWithFee(db, {
          bomId: bom.id,
          slideCount: 1,
          blockCount: 1,
          month: currentMonth,
        })

        db.prepare(`
          UPDATE boms SET
            standard_slide_cost = ?,
            standard_fee_per_slide = ?,
            standard_margin_rate = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          Math.round(result.totalCost * 100) / 100,
          Math.round(result.feeAmount * 100) / 100,
          Math.round(result.profitRate * 10000) / 10000,
          bom.id
        )

        console.log(`  [成本] ${bom.code}: 切片成本=${result.totalCost}, 收费=${result.feeAmount}, 利润率=${(result.profitRate * 100).toFixed(2)}%`)
      } catch (err) {
        console.warn(`  [警告] ${bom.code} 成本计算失败:`, err)
      }
    }

    totalMapped += boms.length
    console.log('')
  }

  console.log('=== 映射完成 ===')
  console.log(`成功映射: ${totalMapped} 个 BOM`)
  console.log(`跳过: ${totalSkipped} 个映射规则`)

  db.close()
}

// 直接运行
seedBomFeeMapping()
