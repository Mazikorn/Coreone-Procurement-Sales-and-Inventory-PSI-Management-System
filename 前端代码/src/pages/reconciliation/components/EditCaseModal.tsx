import React from 'react'
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

  const selectedProject = projects.find(project => project.id === (editCaseProjectId || editCaseTarget.project_id))
  const statusLabel = editCaseStatus === 'normal'
    ? '正常'
    : editCaseStatus === 'modified'
      ? '已修改'
      : '未关联BOM'
  const bomStatus = selectedProject?.hasBom ? '已关联BOM' : '未关联BOM'
  const validationMessage = !selectedProject
    ? '请选择检测项目，系统才能把病例接到 BOM、项目对账和成本差异链路。'
    : !selectedProject.hasBom && editCaseStatus !== 'unmatched'
      ? '当前检测项目未配置 BOM，请先配置 BOM，或将病例保持为未关联BOM待处理。'
      : ''
  const canConfirm = validationMessage === ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">修改病例信息 - {editCaseTarget.case_no}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">检测项目</label>
            <SearchableSelect
              value={editCaseProjectId}
              onChange={val => {
                setEditCaseProjectId(val)
                const project = projects.find(p => p.id === val)
                if (val && project?.hasBom && editCaseStatus === 'unmatched') {
                  setEditCaseStatus('modified')
                }
              }}
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
          {validationMessage ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {validationMessage}
            </div>
          ) : null}
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-900">病例修正结果确认</div>
            <div className="mt-1 text-xs text-emerald-800">
              确认后将接住：LIS病例、检测项目、BOM理论消耗、项目对账、成本差异、审计记录
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-2">
              <div>病理号 {editCaseTarget.case_no}</div>
              <div>状态 {statusLabel}</div>
              <div>检测项目 {selectedProject?.name || '待选择'}</div>
              <div>BOM状态 {bomStatus}</div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm text-white rounded-md ${
              canConfirm ? 'bg-blue-600 hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300'
            }`}
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  )
}
