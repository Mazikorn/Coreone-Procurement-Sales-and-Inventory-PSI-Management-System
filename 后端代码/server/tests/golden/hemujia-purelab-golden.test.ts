/**
 * GOLDEN · 和睦家纯实验室收入（新口径 2026-06-30，已锁）
 *
 * 纯实验室 = 制片(拆) + 染色(IN)；医生诊断 / 报告 / 现场服务 = 诊断桶(OUT)；外送/共建 = 外送桶(OUT)。
 * 制片份额（最终）= 36 × LIS蜡块数 / (36 × LIS蜡块数 + 105)，逐病例（对账单 × LIS 按病理号 join）。
 *
 * 锁定 golden（守恒校验通过）：
 *   - 和睦家全月 26.2：纯实验室 = ¥27,870（真蜡块精算，165 病例 100% LIS 匹配），守恒 55,541。
 *   - 和睦家 W4（单据…）：纯实验室 = ¥7,118（数量估算·无该期 LIS，次锚/下限），守恒 13,152。
 *   - 精度进展：数量-忽略 22,835 → 数量估算 25,772 → LIS 真蜡块 27,870。
 * 口径详见 docs/COREONE-G1收入口径-…；复现 docs/analysis/hemujia-golden-lis-join.cjs。
 *
 * TDD 状态：本测试为红/待实现。Phase 2 需：
 *   ① PartnerConfigLine 加 scope 'split' + splitProcRate；② computeStatementRevenue 逐病例拆分；
 *   ③ ⭐ pipeline 接 LIS 蜡块（对账单 × LIS join）——制片按真蜡块，fixture 单独跑不出 27,870。
 * 现状：computeStatementRevenue 只认 in/out，split 行被当 OUT，labRevenue 仅得染色 ¥11,648。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seedDefaultConfig, type PartnerConfig } from '../../src/utils/partner-config.js'
import { parseLineItems, type Grid } from '../../src/utils/statement-parser/index.js'
import { computeStatementRevenue } from '../../src/utils/statement-revenue.js'

/** 和睦家配置 · 新口径（split + 国标处理费率 / 染色 IN / 报告·现场 诊断桶 / 外送桶）。 */
function hemujiaConfig(): PartnerConfig {
  const c = seedDefaultConfig({ name: '上海和睦家医院', code: 'PT-HMJ' })
  c.lines = [
    { key: 'histo', name: '组织制片', on: true, scope: 'split', splitProcRate: 36, prefixes: [], keywords: ['手术标本', '内镜', '活检'], remarks: [] },
    { key: 'frozen', name: '冰冻制片', on: true, scope: 'split', splitProcRate: 36, prefixes: [], keywords: ['术中', '冰冻切片'], remarks: [] },
    { key: 'tct', name: '细胞TCT制片', on: true, scope: 'split', splitProcRate: 75, prefixes: [], keywords: ['TCT'], remarks: [] },
    { key: 'stain', name: '免疫组化/特染', on: true, scope: 'in', prefixes: [], keywords: ['免疫组化', '特殊染色', '酶组织化学'], remarks: [] },
    { key: 'report', name: '报告(诊断桶)', on: true, scope: 'diagnosis', prefixes: [], keywords: ['报告'], remarks: [] },
    { key: 'onsite', name: '现场服务(诊断桶)', on: true, scope: 'diagnosis', prefixes: [], keywords: ['现场服务'], remarks: [] },
  ] as unknown as PartnerConfig['lines']
  return c
}

describe('GOLDEN 和睦家纯实验室收入（新口径：制片+染色 IN；诊断/报告/现场=诊断桶；外送=外送桶）', () => {
  const fx = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'statements', 'out_line_item__hemujia_2602.json'), 'utf8'),
  )
  const parsed = parseLineItems(fx.grid as Grid)
  const rev = computeStatementRevenue(parsed.rows, hemujiaConfig())

  it('守恒：全部结算 = 声明合计 55,541（不静默吞）', () => {
    expect(Math.round(rev.totalSettle)).toBe(55541)
    expect(parsed.declaredTotal).toBe(55541)
  })

  // ⭐ 待实现（需 split + LIS 蜡块 join）：全月纯实验室 = ¥27,870。fixture 单独跑不出，需接 LIS 蜡块。
  it.todo('全月 26.2（对账单 × LIS 真蜡块）→ 纯实验室 = ¥27,870（守恒诊断桶 27,671）')
})
