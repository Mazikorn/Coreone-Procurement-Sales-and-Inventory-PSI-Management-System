import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { partnerConfigApi, type PartnerListItem } from '@/api/partner-config'
import type { Grid } from '@/api/statement-import'
import type { ImportScore, ImportStatus } from '@/types/statement-import'

// —— 共用设计令牌（主蓝 #3b82f6）——
export const inputCls = 'h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10'
export const btnCls = 'inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPri = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-500 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
export const yuan = (n: number | null | undefined) => '¥' + Math.round(n || 0).toLocaleString('zh-CN')

/** 读 xlsx/csv File → 2D 网格（首个工作表，header:1）。 */
export async function readGrid(file: File): Promise<Grid> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Grid
}

/** 合作医院下拉（finance/admin）。 */
export function useHospitals() {
  const [hospitals, setHospitals] = useState<PartnerListItem[]>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    partnerConfigApi.partners().then((r) => setHospitals(r.list || [])).catch((e) => setErr(e?.message || '加载医院失败'))
  }, [])
  return { hospitals, err }
}

/** 顶部操作条：选医院 + 选月份 + 上传对账单。 */
export function UploadBar({ hospitals, partnerId, onPartner, month, onMonth, onFile, busy, fileName }: {
  hospitals: PartnerListItem[]; partnerId: string; onPartner: (id: string) => void
  month: string; onMonth: (m: string) => void; onFile: (f: File) => void; busy?: boolean; fileName?: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-gray-500">合作医院</span>
        <select className={inputCls + ' w-56'} value={partnerId} onChange={(e) => onPartner(e.target.value)}>
          <option value="">选择医院…</option>
          {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-gray-500">账期</span>
        <input type="month" className={inputCls + ' tabular-nums'} value={month} onChange={(e) => onMonth(e.target.value)} />
      </label>
      <label className={btnPri + ' cursor-pointer'}>
        <Upload className="h-4 w-4" />{busy ? '解析中…' : '上传对账单'}
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </label>
      {fileName && <span className="inline-flex items-center gap-1 text-[12px] text-gray-500"><FileSpreadsheet className="h-3.5 w-3.5" />{fileName}</span>}
    </div>
  )
}

const STATUS_META: Record<ImportStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  ready: { label: '已核对·可设基线', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  review: { label: '全部通过·待人工核对', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2 },
  todo: { label: '有待处理项', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
}

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle
  const color = ok === true ? 'text-emerald-600' : ok === false ? 'text-rose-600' : 'text-gray-400'
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-gray-800">{label}</div>
        <div className="text-[12px] text-gray-500">{detail}</div>
      </div>
    </div>
  )
}

/** 体检卡：识别率 / 对账闭合 / 病例匹配 / 黄金 + status + 未过项。 */
export function ScoreCard({ score, labRevenue }: { score: ImportScore; labRevenue: number }) {
  const m = STATUS_META[score.status]
  const r = score.recognition, cl = score.closure, fwd = score.caseMatch.forward, bwd = score.caseMatch.backward, g = score.golden
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium ${m.cls}`}><m.icon className="h-3.5 w-3.5" />{m.label}</span>
        <span className="text-[13px] text-gray-500">实验室收入 <b className="text-gray-900 tabular-nums">{yuan(labRevenue)}</b></span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Check ok={r.pass} label={`识别率 ${(r.rate * 100).toFixed(0)}%`} detail={`${r.matched}/${r.total} 行；未匹配 ${r.unmatched}、歧义 ${r.ambiguous}`} />
        <Check ok={cl.pass} label="对账闭合" detail={cl.declaredTotal == null ? '对账单无独立合计行' : `逐行 ${yuan(cl.computed)} vs 声明 ${yuan(cl.declaredTotal)}${cl.diff ? `，差 ${yuan(cl.diff)}` : '·对平'}`} />
        <Check ok={fwd.pass} label="病例匹配" detail={fwd.pass == null ? '无本期 LIS 数据' : `命中 ${fwd.matched}/${fwd.withCaseNo}${bwd.missingFromStatement ? `；LIS 另有 ${bwd.missingFromStatement} 例未覆盖` : ''}`} />
        <Check ok={g.pass} label="黄金值" detail={g.expected == null ? '未录入期望实收' : `算出 ${yuan(g.computed)} vs 期望 ${yuan(g.expected)}${g.diff ? `，差 ${yuan(g.diff)}` : '·符'}`} />
      </div>
      {score.failures.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
          {score.failures.map((f, i) => <li key={i}>· {f}</li>)}
        </ul>
      )}
    </div>
  )
}
