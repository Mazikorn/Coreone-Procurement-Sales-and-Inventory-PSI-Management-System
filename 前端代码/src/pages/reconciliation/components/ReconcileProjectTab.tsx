import React from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FileSearch, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ProjectReconcile, MaterialDiff } from '../hooks/useReconciliationPage'

interface Props {
  loading: boolean
  projects: ProjectReconcile[]
  expandedProject: string | null
  projectMaterials: Record<string, MaterialDiff[]>
  projectAuditExceptions: Record<string, Array<{ id?: string; exceptionNo?: string; materialId?: string; status?: string }>>
  dateParams?: { startDate: string; endDate: string }
  onToggleProject: (projectId: string) => void
  getDiffClass: (status: string) => string
  canFixBom: boolean
  onFixBom: (mat: MaterialDiff, projectId: string) => void
  onAuditProject: (projectId: string) => void
  auditingProjectId: string | null
}

function getMaterialDiffReason(material: MaterialDiff) {
  if (material.status === 'match') return '按规格出库，正常余量'
  return material.diff > 0 ? '按规格出库，剩余在库' : '实际用量偏大'
}

function getMaterialDiffNextStep(material: MaterialDiff) {
  if (material.status === 'match') {
    return '下一步：按审计证据回看LIS病例、BOM理论消耗和出库批次即可。'
  }
  if (material.diff > 0) {
    return '下一步：先查审计证据确认是否少出库、病例量偏差或BOM用量偏高；必要时补出库或修正BOM后重审差异。'
  }
  return '下一步：先查审计证据核对LIS病例、BOM理论消耗和出库批次；标准用量不准则修正BOM后重审差异，已生成异常则进入成本异常队列处理。'
}

export function ReconcileProjectTab({
  loading,
  projects,
  expandedProject,
  projectMaterials,
  projectAuditExceptions,
  dateParams,
  onToggleProject,
  getDiffClass,
  canFixBom,
  onFixBom,
  onAuditProject,
  auditingProjectId,
}: Props) {
  const navigate = useNavigate()

  const openMaterialAuditEvidence = (project: ProjectReconcile, material: MaterialDiff) => {
    const keyword = `${project.name} ${material.materialName}`.trim()
    navigate(`/logs?keyword=${encodeURIComponent(keyword)}`)
  }

  const openCostExceptionQueue = (projectId: string) => {
    const exception = (projectAuditExceptions[projectId] || []).find(item => item.exceptionNo || item.id)
    const keyword = exception?.exceptionNo || exception?.id
    const params = new URLSearchParams({
      projectId,
      exceptionType: 'reconciliation_variance',
      status: 'open',
    })
    if (dateParams?.startDate && dateParams?.endDate) {
      params.set('startDate', dateParams.startDate)
      params.set('endDate', dateParams.endDate)
    }
    if (keyword) {
      params.set('keyword', keyword)
    }
    navigate(`/abc/alerts?${params.toString()}`)
  }

  const openProjectBomConfig = (project: ProjectReconcile) => {
    const params = new URLSearchParams({
      keyword: project.name,
      bom: 'unconfigured',
      action: 'edit',
      projectId: project.id,
      tab: 'bom',
    })
    navigate(`/projects?${params.toString()}`)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">加载中...</div>
  }

  if (projects.length === 0) {
    return <div className="text-center py-12 text-gray-400">暂无数据</div>
  }

  return (
    <div className="space-y-4">
      {projects.map(proj => (
        <div key={proj.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div
            className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer"
            onClick={() => onToggleProject(proj.id)}
          >
            <div>
              <div className="font-semibold text-gray-900">{proj.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                LIS病例：{proj.case_count}例 | 关联出库：{proj.outbound_count}例 | 涉及物料：{(proj.boms?.length || 0)}种BOM
              </div>
            </div>
            <div className="flex items-center gap-3">
              {proj.boms?.map(b => (
                <span key={b.id} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full">
                  {b.name}
                </span>
              ))}
              {!proj.hasBom && (
                <span className="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-full">
                  未配置BOM
                </span>
              )}
              {expandedProject === proj.id
                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </div>

          {expandedProject === proj.id && (
            <div className="p-5">
              {!proj.hasBom ? (
                <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="text-sm text-gray-500">
                    该检测项目尚未关联BOM，无法计算理论消耗。
                  </div>
                  <button
                    type="button"
                    onClick={() => openProjectBomConfig(proj)}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    配置BOM
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {(projectAuditExceptions[proj.id] || []).some(item => item.exceptionNo || item.id) && (
                      <button
                        type="button"
                        onClick={() => openCostExceptionQueue(proj.id)}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        处理成本异常
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAuditProject(proj.id)}
                      disabled={auditingProjectId === proj.id}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {auditingProjectId === proj.id ? '审计中...' : '审计差异'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                          <th className="px-3 py-2 text-left">物料</th>
                          <th className="px-3 py-2 text-center">理论消耗</th>
                          <th className="px-3 py-2 text-center">实际出库</th>
                          <th className="px-3 py-2 text-center">差异</th>
                          <th className="px-3 py-2 text-center">原因分析</th>
                          <th className="px-3 py-2 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(projectMaterials[proj.id] || []).map((mat, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900">{mat.materialName}</div>
                              <div className="text-xs text-gray-500">{mat.spec} · {mat.bomUsagePerSample}{mat.bomUnit}/例</div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-block px-2 py-1 rounded text-blue-700 bg-blue-50 font-semibold text-xs">
                                {mat.theoryQty.toFixed(1)} {mat.theoryUnit}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-block px-2 py-1 rounded text-orange-700 bg-orange-50 font-semibold text-xs">
                                {mat.actualQty.toFixed(1)} {mat.actualUnit}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-block px-2 py-1 rounded font-semibold text-xs ${getDiffClass(mat.status)}`}>
                                {mat.diff > 0 ? '+' : ''}{mat.diff.toFixed(1)}
                                <br />
                                <span className="text-[10px] opacity-75">{mat.diffRate}%</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center text-xs text-gray-500">
                              <div className="font-medium text-gray-700">{getMaterialDiffReason(mat)}</div>
                              <div className="mt-1 text-left leading-5 text-gray-500">{getMaterialDiffNextStep(mat)}</div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="flex flex-wrap justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openMaterialAuditEvidence(proj, mat)}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                >
                                  <FileSearch className="h-3.5 w-3.5" />
                                  审计证据
                                </button>
                                {canFixBom && mat.status !== 'match' && (
                                  <button
                                    type="button"
                                    onClick={() => onFixBom(mat, proj.id)}
                                    className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                                  >
                                    修正BOM
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
