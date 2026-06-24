import { useState, useRef } from 'react'
import { Upload, Download } from 'lucide-react'
import { inboundApi } from '@/api/inventory'
import type { InboundFormData, Location, Material, Supplier } from '@/types'
import { toast } from 'sonner'

interface ImportInboundModalProps {
  onClose: () => void
  onSuccess: () => void
  materials: Material[]
  locations: Location[]
  suppliers: Supplier[]
}

interface ParsedInboundRow {
  row: number
  materialCode: string
  materialName: string
  materialId?: string
  batchNo: string
  quantity: number
  price?: number
  supplierName: string
  supplierId?: string
  locationName: string
  locationId?: string
  productionDate?: string
  expiryDate?: string
  remark?: string
  errors: string[]
}

export function buildInboundImportTemplateRows({
  materials,
  locations,
  suppliers,
  baseDate = new Date(),
}: {
  materials: Material[]
  locations: Location[]
  suppliers: Supplier[]
  baseDate?: Date
}) {
  const isSafeTemplateText = (value?: string) => {
    const text = String(value || '').trim()
    if (!text) return false
    return !(/['"`;]/.test(text) || /--/.test(text) || /\bor\b\s+['"\w]+\s*=/i.test(text) || /<script/i.test(text))
  }
  const safeNameOrCode = (item?: { name?: string; code?: string }) => {
    if (!item) return ''
    if (isSafeTemplateText(item.name)) return item.name || ''
    if (!item.name && isSafeTemplateText(item.code)) return item.code || ''
    return ''
  }
  const findSafe = <T extends { name?: string; code?: string }>(items: T[]) =>
    items.find(item => safeNameOrCode(item)) || items[0]

  const formatDate = (date: Date) => date.toISOString().slice(0, 10)
  const expiryDate = new Date(baseDate)
  expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 1)
  const dateText = formatDate(baseDate)
  const expiryText = formatDate(expiryDate)
  const dateCode = dateText.replace(/-/g, '')
  const supplier = findSafe(suppliers)
  const location = findSafe(locations)
  const sampleMaterials = materials.filter(material => isSafeTemplateText(material.code) && isSafeTemplateText(material.name)).slice(0, 2)

  return [
    ['耗材编码', '耗材名称', '批号', '入库数量', '单价', '供应商', '生产日期', '有效期至', '库位', '备注'],
    ...sampleMaterials.map((material, index) => [
      material.code || '',
      material.name || '',
      `B${dateCode}-${String(index + 1).padStart(3, '0')}`,
      10,
      Number((material as any).price || 0),
      safeNameOrCode(supplier),
      dateText,
      expiryText,
      safeNameOrCode(location),
      '',
    ]),
  ]
}

export function getInboundImportActionState({
  importing,
  totalRows,
  validRows,
  invalidRows,
}: {
  importing: boolean
  totalRows: number
  validRows: number
  invalidRows: number
}) {
  if (importing) return { disabled: true, label: '导入中...' }
  if (totalRows === 0 || validRows === 0) return { disabled: true, label: '开始导入' }
  if (invalidRows > 0) return { disabled: true, label: '修正错误后导入' }
  return { disabled: false, label: '开始导入' }
}

function getImportErrorMessage(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data
  return data?.error?.message || data?.message || (error as any)?.message || fallback
}

export default function ImportInboundModal({
  onClose,
  onSuccess,
  materials,
  locations,
  suppliers,
}: ImportInboundModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedInboundRow[]>([])
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validRows = rows.filter(row => row.errors.length === 0)
  const invalidRows = rows.length - validRows.length
  const previewRows = rows.slice(0, 20)
  const importSummary = {
    materialCount: new Set(validRows.map(row => row.materialId || row.materialCode).filter(Boolean)).size,
    batchCount: new Set(validRows.map(row => row.batchNo).filter(Boolean)).size,
    locationCount: new Set(validRows.map(row => row.locationId || row.locationName).filter(Boolean)).size,
    totalQuantity: validRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    totalAmount: validRows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0), 0),
  }
  const actionState = getInboundImportActionState({
    importing,
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows,
  })

  const getCell = (record: Record<string, unknown>, names: string[]): unknown => {
    for (const name of names) {
      if (record[name] !== undefined && record[name] !== null && record[name] !== '') return record[name]
    }
    return ''
  }

  const toText = (value: unknown): string => String(value ?? '').trim()

  const parseNumber = (value: unknown): number => {
    if (typeof value === 'number') return value
    const text = toText(value).replace(/,/g, '')
    return text ? Number(text) : 0
  }

  const normalizeDate = (value: unknown, XLSX: any): string | undefined => {
    if (!value) return undefined
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10)
    }
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (parsed) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
      }
    }
    const text = toText(value)
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text || undefined
  }

  const isDateText = (value?: string): boolean => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }

  const parseRows = async (f: File): Promise<ParsedInboundRow[]> => {
    const XLSX = await import('xlsx')
    const data = await f.arrayBuffer()
    const wb = XLSX.read(data, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
    if (rawRows.length < 2) return []

    const headers = rawRows[0].map((h) => toText(h))
    return rawRows.slice(1).map((row, index) => {
      const record: Record<string, unknown> = {}
      headers.forEach((header, idx) => {
        if (header) record[header] = row[idx]
      })
      return { record, rowNumber: index + 2 }
    }).filter(({ record }) => Object.values(record).some(value => toText(value) !== '')).map(({ record, rowNumber }) => {
      const errors: string[] = []
      const materialCode = toText(getCell(record, ['耗材编码', '物料编码', '材料编码']))
      const batchNo = toText(getCell(record, ['批号', '批次号']))
      const quantity = parseNumber(getCell(record, ['入库数量', '数量']))
      const priceValue = getCell(record, ['单价', '入库单价', '价格'])
      const price = priceValue === '' ? undefined : parseNumber(priceValue)
      const supplierName = toText(getCell(record, ['供应商', '供应商名称', '供应商编码']))
      const locationName = toText(getCell(record, ['库位', '库位名称', '库位编码']))
      const productionDate = normalizeDate(getCell(record, ['生产日期']), XLSX)
      const expiryDate = normalizeDate(getCell(record, ['有效期至', '有效期', '失效日期']), XLSX)
      const remark = toText(getCell(record, ['备注']))

      const matchedMaterial = materialCode
        ? materials.find(material => material.code === materialCode)
        : undefined
      const matchedLocation = locationName
        ? locations.find(location => location.name === locationName || location.code === locationName)
        : undefined
      const matchedSupplier = supplierName
        ? suppliers.find(supplier => supplier.name === supplierName || supplier.code === supplierName)
        : undefined

      if (!materialCode) errors.push('耗材编码必填')
      if (materialCode && !matchedMaterial) errors.push('耗材编码不存在')
      if (!batchNo) errors.push('批号必填')
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push('数量必须大于 0')
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) errors.push('单价不能小于 0')
      if (!locationName) errors.push('库位必填')
      if (locationName && !matchedLocation) errors.push('库位不存在')
      if (supplierName && !matchedSupplier) errors.push('供应商不存在')
      if (!isDateText(expiryDate)) errors.push('有效期必须为 YYYY-MM-DD')
      if (productionDate && !isDateText(productionDate)) errors.push('生产日期必须为 YYYY-MM-DD')

      return {
        row: rowNumber,
        materialCode,
        materialName: matchedMaterial?.name || toText(getCell(record, ['耗材名称', '物料名称'])) || '-',
        materialId: matchedMaterial?.id,
        batchNo,
        quantity,
        price,
        supplierName,
        supplierId: matchedSupplier?.id,
        locationName,
        locationId: matchedLocation?.id,
        productionDate,
        expiryDate,
        remark,
        errors,
      }
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setRows([])
    try {
      const parsed = await parseRows(f)
      if (parsed.length === 0) {
        toast.error('文件为空或格式不正确')
        return
      }
      setRows(parsed)
      if (parsed.length > 20) {
        toast.info(`文件共 ${parsed.length} 条，显示前 20 条预览`)
      }
    } catch {
      toast.error('解析文件失败')
    }
  }

  const handleImport = async () => {
    if (!file || validRows.length === 0) return
    if (invalidRows > 0) {
      toast.error('请先修正错误数据', { description: '批量入库将整批提交，存在错误行时不会导入部分有效行' })
      return
    }
    setImporting(true)
    try {
      const payload: InboundFormData[] = validRows.map(row => ({
        type: 'direct',
        materialId: row.materialId!,
        batchNo: row.batchNo,
        quantity: row.quantity,
        price: row.price,
        supplierId: row.supplierId,
        locationId: row.locationId!,
        productionDate: row.productionDate,
        expiryDate: row.expiryDate,
        remark: row.remark,
      }))

      const res = await inboundApi.batchCreate(payload)
      toast.success('导入成功', {
        description: `成功导入 ${res.createdCount} 条`,
      })
      onSuccess()
    } catch (e) {
      toast.error(getImportErrorMessage(e, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = buildInboundImportTemplateRows({ materials, locations, suppliers })
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

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">数据预览（前 {previewRows.length} 条）</div>
            <div className="text-xs text-gray-500">有效 {validRows.length} 条，错误 {invalidRows} 条</div>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-auto max-h-60">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">行</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">状态</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">耗材编码</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">批号</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">数量</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">单价</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">库位</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">有效期</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">问题</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.map((row) => (
                  <tr key={row.row} className={row.errors.length ? 'bg-red-50' : undefined}>
                    <td className="px-2 py-1.5 text-gray-700">{row.row}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 ${row.errors.length ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {row.errors.length ? '错误' : '有效'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-700">{row.materialCode || '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.batchNo || '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.quantity || '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.price ?? '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.locationName || '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.expiryDate || '-'}</td>
                    <td className="px-2 py-1.5 text-gray-700 min-w-40">{row.errors.join('；') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-900">入库导入结果确认</div>
            <div className="mt-1 text-xs text-emerald-800">
              确认后将接住：入库单、库存、批次、库位、成本、库存流水、审计记录
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-4">
              <div>可导入 {validRows.length} 条</div>
              <div>需修正 {invalidRows} 条</div>
              <div>批次数 {importSummary.batchCount} 个</div>
              <div>物料数 {importSummary.materialCount} 个</div>
              <div>库位数 {importSummary.locationCount} 个</div>
              <div>入库数量 {Number(importSummary.totalQuantity.toFixed(6)).toString()}</div>
              <div>入库金额 ¥{importSummary.totalAmount.toFixed(2)}</div>
              <div>{invalidRows > 0 ? '整批导入将被阻断' : '可整批导入'}</div>
            </div>
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
          <li>必填字段：耗材编码、批号、入库数量、有效期至、库位</li>
          <li>耗材、库位、供应商必须与系统内编码或名称完全一致</li>
          <li>日期格式：YYYY-MM-DD</li>
          <li>存在错误行时不会导入部分有效行，请修正后整批提交</li>
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
          disabled={actionState.disabled}
          className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {actionState.label}
        </button>
      </div>
    </div>
  )
}
