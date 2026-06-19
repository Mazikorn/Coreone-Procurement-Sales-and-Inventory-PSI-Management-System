import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { downloadTextFile } from '@/lib/utils'
import { buildLisImportPreview, buildLisImportTemplateCsv, type LisImportError } from '../hooks/useReconciliationPage'

interface Props {
  open: boolean
  importData: string
  setImportData: (v: string) => void
  setImportFile: (file: File | null) => void
  importErrors: LisImportError[]
  onClose: () => void
  onConfirm: () => void
}

export function ImportLisModal({ open, importData, setImportData, setImportFile, importErrors, onClose, onConfirm }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const preview = useMemo(() => importData.trim() ? buildLisImportPreview(importData) : null, [importData])
  const visibleErrors = importErrors.length > 0 ? importErrors : preview?.errors || []

  const readTextFile = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsText(file)
  })

  const readXlsxFile = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = wb.SheetNames[0]
    if (!firstSheetName) return ''
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(wb.Sheets[firstSheetName], { header: 1, blankrows: false })
    return rows
      .map(row => row.map(cell => String(cell ?? '').trim()).join('\t').trim())
      .filter(Boolean)
      .join('\n')
  }

  const importFile = async (file: File) => {
    if (!file) return

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const content = ext === 'xlsx' || ext === 'xls'
        ? await readXlsxFile(file)
        : await readTextFile(file)

      if (!content.trim()) {
        toast.error('文件为空或格式不正确')
        return
      }

      setImportData(content)
      setImportFile(file)
      setFileName(file.name)
      toast.success('文件已读取，请确认后导入')
    } catch {
      toast.error('文件读取失败，请检查格式')
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await importFile(file)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) await importFile(file)
  }

  const handleDownloadTemplate = () => {
    downloadTextFile('lis-import-template.csv', buildLisImportTemplateCsv(), 'text/csv;charset=utf-8')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">导入LIS病例数据</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
            onClick={() => inputRef.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
            <div className="font-medium text-gray-700">选择或拖入LIS数据文件</div>
            <div className="text-sm text-gray-500 mt-1">支持 .csv、.txt、.xlsx，字段为 病理号,检测项目,操作时间,操作人</div>
            {fileName && <div className="mt-2 text-xs text-blue-600">{fileName}</div>}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              下载模板
            </button>
          </div>
          <textarea
            value={importData}
            onChange={e => {
              setImportFile(null)
              setFileName('')
              setImportData(e.target.value)
            }}
            placeholder={`P24050187,HE制片,2026-04-15 14:30,张三\nP24050188,免疫组化-IHC,2026-04-15 15:00,李四`}
            rows={6}
            className="w-full mt-4 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 font-mono"
          />
          {preview && preview.total > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-xs text-gray-500">解析总数</div>
                <div className="mt-1 font-semibold text-gray-900">{preview.total}</div>
              </div>
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
                <div className="text-xs text-green-700">可导入</div>
                <div className="mt-1 font-semibold text-green-700">{preview.validCount}</div>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <div className="text-xs text-red-700">需修正</div>
                <div className="mt-1 font-semibold text-red-700">{preview.failedCount}</div>
              </div>
            </div>
          )}
          {visibleErrors.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="font-medium">发现 {visibleErrors.length} 条无效数据</div>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {visibleErrors.slice(0, 8).map(error => (
                  <li key={`${error.row}-${error.caseNo || ''}`}>
                    第 {error.row} 条{error.caseNo ? `（${error.caseNo}）` : ''}：{error.message}
                  </li>
                ))}
              </ul>
              {visibleErrors.length > 8 && (
                <div className="mt-2 text-xs text-red-600">还有 {visibleErrors.length - 8} 条，请先修正文件后重新导入。</div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">确认导入</button>
        </div>
      </div>
    </div>
  )
}
