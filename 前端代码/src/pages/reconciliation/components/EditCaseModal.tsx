import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { LisCase, ProjectReconcile } from '../hooks/useReconciliationPage'

interface Props {
  open: boolean
  editCaseTarget: LisCase | null
  editCaseProjectId: string
  setEditCaseProjectId: (v: string) => void
  editCaseStatus: string
  setEditCaseStatus: (v: string) => void
  projects: ProjectReconcile[]
  onClose: () => void
  onConfirm: () => void
}

export function EditCaseModal({
  open,
  editCaseTarget,
  editCaseProjectId,
  setEditCaseProjectId,
  editCaseStatus,
  setEditCaseStatus,
  projects,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !editCaseTarget) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">修改病例信息 - {editCaseTarget.case_no}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">检测项目</label>
            <SearchableSelect
              value={editCaseProjectId}
              onChange={val => setEditCaseProjectId(val)}
              options={[
                { value: '', label: '请选择' },
                ...projects.map(p => ({ value: p.id, label: p.name })),
              ]}
              placeholder="请选择"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <SearchableSelect
              value={editCaseStatus}
              onChange={val => setEditCaseStatus(val)}
              options={[
                { value: 'normal', label: '正常' },
                { value: 'modified', label: '已修改' },
                { value: 'unmatched', label: '未关联BOM' },
              ]}
              placeholder="请选择"
            />
          </div>
          <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
            <strong>说明：</strong>修改仅影响本病例的成本归集，不会修改BOM标准。如需修改标准用量，请使用"修正BOM"功能。
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">保存修改</button>
        </div>
      </div>
    </div>
  )
}
