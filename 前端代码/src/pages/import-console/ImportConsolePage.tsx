import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Loader2, AlertCircle, FlaskConical, Flag, ArrowRight } from 'lucide-react'
import { statementImportApi, type Grid } from '@/api/statement-import'
import { partnerConfigApi } from '@/api/partner-config'
import type { PreviewResult } from '@/types/statement-import'
import type { PartnerConfigLine } from '@/types/partner-config'
import { UploadBar, ScoreCard, useHospitals, readGrid, btnCls, btnPri, inputCls, yuan } from '@/pages/import-shared/ImportShared'

export default function ImportConsolePage() {
  const { hospitals } = useHospitals()
  const [partnerId, setPartnerId] = useState('')
  const [month, setMonth] = useState('')
  const [grid, setGrid] = useState<Grid | null>(null)
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState<PartnerConfigLine[]>([])
  const [configVersion, setConfigVersion] = useState(0)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 选医院 → 载入该院业务线（供内联归类下拉）
  useEffect(() => {
    if (!partnerId) { setLines([]); return }
    partnerConfigApi.get(partnerId).then((env) => { setLines(env.config.lines); setConfigVersion(env.version) }).catch(() => {})
    setPreview(null); setGrid(null); setFileName('')
  }, [partnerId])

  const runPreview = useCallback(async (g: Grid) => {
    if (!partnerId) { toast.error('请先选择医院'); return }
    setBusy(true); setError('')
    try {
      const r = await statementImportApi.preview({ partnerId, grid: g, serviceMonth: month || undefined })
      setPreview(r); setConfigVersion(r.configVersion)
    } catch (e: any) {
      setError(e?.message || '预览失败'); setPreview(null)
    } finally { setBusy(false) }
  }, [partnerId, month])

  const onFile = useCallback(async (f: File) => {
    setBusy(true); setFileName(f.name)
    try { const g = await readGrid(f); setGrid(g); await runPreview(g) }
    catch (e: any) { setError('读取文件失败：' + (e?.message || '')); setBusy(false) }
  }, [runPreview])

  // 内联归类：把某未匹配行的项目名加为某业务线的识别词（项目名含）→ 写回该院配置 → 重新预览
  const classify = useCallback(async (item: string, lineKey: string) => {
    if (!partnerId || !lineKey || !grid) return
    try {
      await statementImportApi.classifyRule({ partnerId, lineKey, ruleType: 'keyword', value: item })
      const env = await partnerConfigApi.get(partnerId); setLines(env.config.lines)
      toast.success('已写回该院配置，重新预览')
      await runPreview(grid)
    } catch { /* 拦截器已 toast */ }
  }, [partnerId, grid, runPreview])

  const setBaseline = useCallback(async () => {
    if (!partnerId || !configVersion) return
    try { await partnerConfigApi.baseline(partnerId, configVersion); toast.success(`已设 v${configVersion} 为月度导入基线`) }
    catch { /* 拦截器已 toast */ }
  }, [partnerId, configVersion])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-blue-500" />
        <h1 className="text-[18px] font-semibold text-gray-900">导入测试台</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500"><Lock className="h-3 w-3" />仅财务 / 管理员</span>
      </div>
      <p className="mb-4 text-[13px] text-gray-500">上传一张对账单样表，按该院配置规则解析+分类，给出体检卡；未匹配的行可当场归类（写回该院配置、立即生效）；核对无误后设为月度导入基线。</p>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <UploadBar hospitals={hospitals} partnerId={partnerId} onPartner={setPartnerId} month={month} onMonth={setMonth} onFile={onFile} busy={busy} fileName={fileName} />
      </div>

      {busy && !preview ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />解析中…</div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
      ) : !preview ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-[13px] text-gray-400">{partnerId ? '上传对账单样表后，这里出解析与体检结果' : '先选择一家合作医院'}</div>
      ) : preview.note ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-[13px] text-gray-600 shadow-sm"><span className="font-medium">{preview.template}</span> · {preview.note}</div>
      ) : (
        <div className="space-y-4">
          {/* 体检卡 */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-gray-900">体检卡 <span className="text-[12px] font-normal text-gray-400">· 模板 {preview.template} · 配置 v{preview.configVersion}</span></h2>
              <button className={btnCls} onClick={setBaseline} disabled={preview.score.status === 'todo'} title={preview.score.status === 'todo' ? '有待处理项，先归类/核对' : '设为月度导入基线'}><Flag className="h-4 w-4" />设为导入基线</button>
            </div>
            <ScoreCard score={preview.score} labRevenue={preview.revenue.labRevenue} />
          </div>

          {/* 逐线拆分 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-900">按业务线拆分</h3>
              <table className="w-full text-[12.5px] tabular-nums">
                <thead><tr className="text-left text-[11.5px] text-gray-400"><th className="py-1">业务线</th><th>算不算实验室</th><th className="text-right">笔数</th><th className="text-right">结算额</th></tr></thead>
                <tbody>
                  {preview.revenue.byLine.map((l) => (
                    <tr key={l.key} className="border-t border-gray-100"><td className="py-1.5 text-gray-800">{l.name}</td>
                      <td>{l.scope === 'in' ? <span className="text-emerald-600">计入</span> : <span className="text-gray-400">不计入</span>}</td>
                      <td className="text-right text-gray-600">{l.count}</td><td className="text-right text-gray-900">{yuan(l.settle)}</td></tr>
                  ))}
                  <tr className="border-t border-gray-200 font-medium"><td className="py-1.5">实验室收入合计</td><td></td><td></td><td className="text-right text-blue-600">{yuan(preview.revenue.labRevenue)}</td></tr>
                </tbody>
              </table>
            </div>

            {/* 待归类 */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-900">待人工归类 <span className="text-[11.5px] font-normal text-gray-400">（{preview.needsAttention.length} 行）</span></h3>
              {preview.needsAttention.length === 0 ? (
                <div className="py-6 text-center text-[12.5px] text-emerald-600">全部已识别 ✓</div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {preview.needsAttention.map((row, i) => <AttentionItem key={i} item={row.item} no={row.no} settle={row.settle} status={row.status} lines={lines} onClassify={(lk) => classify(row.item, lk)} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AttentionItem({ item, no, settle, status, lines, onClassify }: {
  item: string; no: string; settle: number; status: string; lines: PartnerConfigLine[]; onClassify: (lineKey: string) => void
}) {
  const [lk, setLk] = useState('')
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-gray-800">{item || '（无项目名）'}</div>
          <div className="text-[11px] text-gray-500">{no || '无病理号'} · {status === 'ambiguous' ? '歧义' : '未匹配'} · {yuan(settle)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select className={inputCls + ' h-8 flex-1 text-[12px]'} value={lk} onChange={(e) => setLk(e.target.value)}>
          <option value="">归到业务线…</option>
          {lines.map((l) => <option key={l.key} value={l.key}>{l.name}（{l.scope === 'in' ? '计入' : '不计入'}）</option>)}
        </select>
        <button className={btnPri + ' h-8'} disabled={!lk} onClick={() => onClassify(lk)}>归类<ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
