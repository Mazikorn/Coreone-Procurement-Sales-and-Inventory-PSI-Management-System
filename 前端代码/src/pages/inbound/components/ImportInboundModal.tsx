import { useState, useRef } from 'react'
import { Upload, Download } from 'lucide-react'
import { inboundApi } from '@/api/inventory'
import type { Material, Location } from '@/types'
import { toast } from 'sonner'

interface ImportInboundModalProps {
  onClose: () => void
  onSuccess: () => void
  materials: Material[]
  locations: Location[]
}

export default function ImportInboundModal({
  onClose,
  onSuccess,
  materials,
  locations,
}: ImportInboundModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    try {
      const XLSX = await import('xlsx')
      const data = await f.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      if (rows.length < 2) {
        toast.error('文件为空或格式不正确')
        return
      }
      const headers = rows[0].map((h: any) => String(h).trim())
      const records = rows.slice(1).map((row: any[], i: number) => {
        const obj: Record<string, any> = { _row: i + 2 }
        headers.forEach((h, idx) => { obj[h] = row[idx] })
        return obj
      }).filter(r => Object.values(r).some(v => v !== undefined && v !== ''))
      setPreview(records.slice(0, 20))
      if (records.length > 20) {
        toast.info(`文件共 ${records.length} 条，显示前 20 条预览`)
      }
    } catch {
      toast.error('解析文件失败')
    }
  }

  const handleImport = async () => {
    if (!file || preview.length === 0) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
      const headers = rows[0].map((h: any) => String(h).trim())
      const records = rows.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {}
        headers.forEach((h, idx) => { obj[h] = row[idx] })
        return obj
      }).filter(r => Object.values(r).some(v => v !== undefined && v !== ''))

      let successCount = 0
      let failCount = 0
      for (const record of records) {
        const materialName = record['耗材名称'] || record['物料名称'] || ''
        const materialCode = record['耗材编码'] || record['物料编码'] || ''
        const quantity = Number(record['入库数量'] || record['数量'] || 0)
        const batchNo = record['批号'] || ''
        const locationName = record['库位'] || ''
        const productionDate = record['生产日期'] || ''
        const expiryDate = record['有效期'] || record['有效期至'] || ''
        const remark = record['备注'] || ''

        let materialId = ''
        if (materialCode) {
          const matched = materials.find(m => m.code === materialCode)
          if (matched) materialId = matched.id
        }
        if (!materialId && materialName) {
          const matched = materials.find(m => m.name === materialName)
          if (matched) materialId = matched.id
        }

        let locationId = locations[0]?.id || ''
        if (locationName) {
          const matched = locations.find(l => l.name === locationName)
          if (matched) locationId = matched.id
        }

        if (!materialId || !quantity) {
          failCount++
          continue
        }

        try {
          await inboundApi.create({
            type: 'direct',
            materialId,
            quantity,
            batchNo,
            locationId,
            productionDate: productionDate ? new Date(productionDate).toISOString().split('T')[0] : undefined,
            expiryDate: expiryDate ? new Date(expiryDate).toISOString().split('T')[0] : undefined,
            remark,
          } as any)
          successCount++
        } catch {
          failCount++
        }
      }

      if (failCount === 0) {
        toast.success('导入成功', { description: `成功导入 ${successCount} 条记录` })
      } else {
        toast.success(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`)
      }
      onSuccess()
    } catch {
      toast.error('导入失败')
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = [
        ['耗材编码', '耗材名称', '批号', '入库数量', '生产日期', '有效期至', '库位', '备注'],
        ['M001', 'DNA提取试剂盒', 'B20240501', 10, '2024-05-01', '2025-05-01', 'A1-01', '首次入库'],
        ['M002', 'PCR引物', 'B20240601', 5, '2024-06-01', '2025-06-01', 'A1-02', ''],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '入库导入模板')
      XLSX.writeFile(wb, '入库导入模板.xlsx')
    } catch {
      toast.error('模板下载失败，请重试')
    }
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <div className="text-base font-medium text-gray-900 mb-2">{file ? file.name : '点击或拖拽文件到此处'}</div>
        <div className="text-sm text-gray-500">支持 Excel (.xlsx, .xls) 和 CSV 格式</div>
      </div>

      {preview.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">数据预览（前 {preview.length} 条）</div>
          <div className="border border-gray-200 rounded-lg overflow-auto max-h-60">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).filter(k => !k.startsWith('_')).map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {Object.keys(preview[0]).filter(k => !k.startsWith('_')).map(h => (
                      <td key={h} className="px-2 py-1.5 text-gray-700">{row[h] ?? '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-sm text-gray-600 mb-2">模板下载：</div>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> 入库导入模板.xlsx
        </button>
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600 mb-2">导入说明：</div>
        <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
          <li>请使用提供的模板格式填写数据</li>
          <li>必填字段：耗材编码/名称、入库数量</li>
          <li>日期格式：YYYY-MM-DD</li>
          <li>单次导入最多支持 1000 条记录</li>
        </ul>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleImport}
          disabled={importing || preview.length === 0}
          className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {importing ? '导入中...' : '开始导入'}
        </button>
      </div>
    </div>
  )
}
