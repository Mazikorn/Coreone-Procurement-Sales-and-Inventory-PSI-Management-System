// 对账单导入（测试台 / 月度向导）—— 与后端 statement-import-v1.1 路由响应对应。

export type ImportStatus = 'todo' | 'review' | 'ready'

export interface ImportScore {
  recognition: { total: number; matched: number; unmatched: number; ambiguous: number; rate: number; pass: boolean }
  closure: { declaredTotal: number | null; computed: number; diff: number | null; pass: boolean | null }
  caseMatch: {
    forward: { withCaseNo: number; matched: number; rate: number; pass: boolean | null }
    backward: { lisInPeriod: number; missingFromStatement: number; missingCaseNos: string[]; pass: boolean | null }
  }
  golden: { expected: number | null; computed: number; diff: number | null; pass: boolean | null }
  status: ImportStatus
  failures: string[]
}

export interface LineRevenue { key: string; name: string; scope: 'in' | 'out'; count: number; settle: number }

export interface PreviewRevenue {
  labRevenue: number
  outSettle: number
  unmatchedSettle: number
  ambiguousSettle: number
  totalSettle: number
  byLine: LineRevenue[]
  counts: { total: number; in: number; out: number; unmatched: number; ambiguous: number }
}

export interface AttentionRow { no: string; item: string; settle: number; status: 'unmatched' | 'ambiguous' }

export interface PreviewResult {
  partnerId: string
  configVersion: number
  template: string
  serviceMonth: string | null
  declaredTotal: number | null
  revenue: PreviewRevenue
  score: ImportScore
  needsAttention: AttentionRow[]
  // 汇总/利润表模板时（无逐 case）
  note?: string
  parsed?: unknown
}

export interface CommitResult {
  partnerId: string
  serviceMonth: string
  configVersion: number
  importBatch: string
  caseCount: number
  labRevenue: number
  outSettle: number
  unmatchedSettle: number
  ambiguousSettle: number
  skippedNoCase: number
}
