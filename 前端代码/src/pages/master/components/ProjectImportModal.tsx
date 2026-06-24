import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Download, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { ProjectImportRow } from '../hooks/useProjectsPage'
import type { BOM } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  importing: boolean
  boms?: BOM[]
  onImport: (rows: ProjectImportRow[]) => Promise<{ success: number; failed: number }>
}

interface ParsedRow extends ProjectImportRow {
  rowNumber: number
}

const serviceTypeAliases: Record<string, string> = {
  he: 'he',
  '病理技术-he制片': 'he',
  he制片: 'he',
  ihc: 'ihc',
  '病理技术-免疫组化': 'ihc',
  免疫组化: 'ihc',
  ss: 'ss',
  '病理技术-特殊染色': 'ss',
  特殊染色: 'ss',
  mp: 'mp',
  分子诊断: 'mp',
  molecular: 'mp',
  cyto: 'cyto',
  '病理诊断-细胞学检测': 'cyto',
  细胞学检测: 'cyto',
}

const templateRows = [
  ['服务编码', '服务名称', '服务类型', '检测周期', '负责人', '状态', '描述', 'BOM ID'],
  ['HE-001', 'HE染色', 'he', '1天', '张三', '启用', '常规HE染色服务', ''],
  ['IHC-001', '免疫组化检测', 'ihc', '3天', '李四', '启用', '免疫组化检测服务', ''],
]

const getCell = (row: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

const normalizeStatus = (value: string): 'active' | 'inactive' => {
  if (value === 'inactive' || value === '停用' || value === '禁用') return 'inactive'
  return 'active'
}

const normalizeProjectType = (value: string) => {
  const normalized = String(value || 'he').trim().toLowerCase()
  return serviceTypeAliases[normalized] || ''
}

const getBomMaterialCount = (bom: BOM) => bom.materials?.length ?? bom.materialCount ?? 0

export function parseProjectImportRows(rawRows: Record<string, unknown>[], boms?: BOM[]) {
  const parsedRows: ParsedRow[] = []
  const errors: string[] = []

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2
    const rawType = getCell(row, ['服务类型', '项目类型', '类型', 'type']) || 'he'
    const type = normalizeProjectType(rawType)
    const parsed: ParsedRow = {
      rowNumber,
      code: getCell(row, ['服务编码', '项目编码', '编码', 'code']),
      name: getCell(row, ['服务名称', '项目名称', '名称', 'name']),
      type: type || rawType,
      cycle: getCell(row, ['检测周期', '周期', 'cycle']),
      manager: getCell(row, ['负责人', 'manager']),
      status: normalizeStatus(getCell(row, ['状态', 'status'])),
      description: getCell(row, ['描述', '备注', 'description']),
      bomId: getCell(row, ['BOM ID', 'BOM', 'bomId']),
    }

    if (!parsed.code || !parsed.name) {
      errors.push(`第 ${rowNumber} 行缺少服务编码或服务名称`)
      return
    }
    if (!type) {
      errors.push(`第 ${rowNumber} 行服务类型无效：${rawType}`)
      return
    }
    if (parsed.bomId && boms) {
      const bom = boms.find(item => item.id === parsed.bomId)
      if (!bom || bom.status !== 'active') {
        errors.push(`第 ${rowNumber} 行BOM ID不存在或未启用：${parsed.bomId}`)
        return
      }
      if (bom.type !== type && bom.type !== 'project') {
        errors.push(`第 ${rowNumber} 行BOM类型与服务类型不一致：${parsed.bomId}`)
        return
      }
      if (getBomMaterialCount(bom) <= 0) {
        errors.push(`第 ${rowNumber} 行BOM缺少核心物料：${parsed.bomId}`)
        return
      }
    }

    parsedRows.push({ ...parsed, type })
  })

  return { rows: parsedRows, errors }
}

export function ProjectImportModal({ open, onClose, importing, boms, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const validRows = useMemo(
    () => rows.filter(row => row.code && row.name),
    [rows]
  )
  const importSummary = useMemo(() => ({
    validCount: validRows.length,
    bomLinkedCount: validRows.filter(row => row.bomId).length,
    noBomCount: validRows.filter(row => !row.bomId).length,
    errorCount: errors.length,
  }), [errors.length, validRows])

  if (!open) return null

  const parseFile = async (file: File) => {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    const { rows: parsedRows, errors: nextErrors } = parseProjectImportRows(rawRows, boms)

    setRows(parsedRows)
    setErrors(nextErrors.slice(0, 20))

    if (parsedRows.length === 0) {
      toast.error('没有可导入的数据')
    } else if (nextErrors.length > 0) {
      toast.warning(`解析完成：${parsedRows.length} 条可导入，${nextErrors.length} 条需修正`)
    } else {
      toast.success(`已解析 ${parsedRows.length} 条检测服务`)
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setRows([])
    setErrors([])

    try {
      await parseFile(file)
    } catch {
      toast.error('文件解析失败，请检查格式')
    }
  }

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('请先选择包含有效数据的文件')
      return
    }
    await onImport(validRows)
  }

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet(templateRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '检测服务导入模板')
      XLSX.writeFile(wb, '检测服务导入模板.xlsx')
    } catch {
      toast.error('模板下载失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">导入检测服务</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择文件</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-500 mb-3">{fileName || '点击选择 .xlsx 或 .csv 文件'}</p>
              <button
                type="button"
                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              >
                选择文件
              </button>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">支持格式：.xlsx, .csv</p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Download className="w-3 h-3" />下载导入模板
            </button>
          </div>

          {rows.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700">预览前 {Math.min(rows.length, 8)} 条</div>
              <div className="max-h-56 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['行号', '编码', '名称', '类型', '周期', '负责人', '状态'].map(header => (
                        <th key={header} className="px-2 py-2 text-left font-medium text-gray-500">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 8).map(row => (
                      <tr key={row.rowNumber}>
                        <td className="px-2 py-1.5 text-gray-500">{row.rowNumber}</td>
                        <td className="px-2 py-1.5 text-gray-700">{row.code}</td>
                        <td className="px-2 py-1.5 text-gray-900 font-medium">{row.name}</td>
                        <td className="px-2 py-1.5 text-gray-700">{row.type}</td>
                        <td className="px-2 py-1.5 text-gray-700">{row.cycle || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-700">{row.manager || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-700">{row.status === 'active' ? '启用' : '停用'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <div className="mb-1 font-medium">以下行未导入</div>
              <div className="space-y-1">
                {errors.map(error => <div key={error}>{error}</div>)}
              </div>
            </div>
          )}

          {(rows.length > 0 || errors.length > 0) && (
            <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="text-sm font-semibold text-emerald-900">导入结果确认</div>
              <div className="mt-1 text-xs text-emerald-800">确认后将接住：检测服务、BOM、出库、LIS对账、项目成本、审计记录</div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-4">
                <div>可导入 {importSummary.validCount} 条</div>
                <div>关联BOM {importSummary.bomLinkedCount} 条</div>
                <div>未关联BOM {importSummary.noBomCount} 条</div>
                <div>需修正 {importSummary.errorCount} 条</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300">
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? '导入中...' : `开始导入${validRows.length ? ` (${validRows.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
