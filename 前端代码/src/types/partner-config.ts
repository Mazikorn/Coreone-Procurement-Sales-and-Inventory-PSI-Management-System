// 逐院配置类型（与后端 utils/partner-config.ts 的 PartnerConfig 1:1）。

export interface PartnerConfigLine {
  key: string
  name: string
  on: boolean
  scope: 'in' | 'out' // 计入实验室 / 移出
  prefixes: string[] // 病理号前缀识别词
  keywords: string[] // 项目名含
  remarks: string[] // 备注含
}

export interface PartnerConfig {
  basic: { full: string; short: string; code: string; group: string; campus: string; start: string; status: string; contact: string }
  amount: { bill: '未税' | '含税'; settle: '未税' | '含税'; rate: number }
  parse: { uploaded: boolean; file: string; rows: number; template: string; colMap: Record<string, unknown> }
  lines: PartnerConfigLine[]
  discount: { def: number; byLine: { key: string; rate: number }[]; byItem: { item: string; rate: number }[] }
  special: { retainer: { on: boolean; name: string; amount: number }; joint: { on: boolean; ratio: number; share: string } }
}

export interface ConfigEnvelope {
  partnerId: string
  version: number
  isBaseline: boolean
  config: PartnerConfig
}

export interface FriendlyDiff { path: string; label: string; before: unknown; after: unknown }
export interface ConfigChange {
  version: number
  kind: 'seed' | 'edit' | 'rollback'
  tab: string | null
  diffs: FriendlyDiff[]
  changedAt: string
  changedBy: string | null
}
