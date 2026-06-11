import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface Props {
  loading: boolean
  data: {
    summary?: { totalCost: number; projectCount: number }
    projects?: Array<{
      projectId: string
      projectName: string
      totalCost: number
      sampleCount: number
      groups: Array<{
        groupName: string
        sampleCount: number
        totalCost: number
        ratio: string
        materials: Array<{
          materialId: string
          materialName: string
          quantity: number
          totalCost: number
          ratio: string
        }>
      }>
    }>
  } | null
}

export function ProjectGroupCostTable({ loading, data }: Props) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400">
        <p>加载中...</p>
      </div>
    )
  }

  const projects = data?.projects || []
  const summary = data?.summary

  if (projects.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400">
        <p>暂无分组成本数据</p>
      </div>
    )
  }

  const toggleProject = (id: string) => {
    const next = new Set(expandedProjects)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedProjects(next)
  }

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpandedGroups(next)
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex items-center gap-4 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-md border border-gray-200">
          <span>总成本: <strong className="text-gray-900">¥{summary.totalCost.toFixed(2)}</strong></span>
          <span>项目数: <strong className="text-gray-900">{summary.projectCount}</strong></span>
        </div>
      )}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">项目/分组/物料</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-24">样本数</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-28">总成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 w-20">占比</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((project) => {
              const isProjectExpanded = expandedProjects.has(project.projectId)
              return (
                <>
                  {/* 项目行 */}
                  <tr
                    key={project.projectId}
                    className="bg-gray-50/50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleProject(project.projectId)}
                  >
                    <td className="px-4 py-3">
                      {isProjectExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{project.projectName}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{project.sampleCount}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      ¥{project.totalCost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">-</td>
                  </tr>
                  {/* 分组行 */}
                  {isProjectExpanded &&
                    project.groups.map((group) => {
                      const groupKey = `${project.projectId}-${group.groupName}`
                      const isGroupExpanded = expandedGroups.has(groupKey)
                      return (
                        <>
                          <tr
                            key={groupKey}
                            className="bg-white hover:bg-gray-50/30 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleGroup(groupKey)
                            }}
                          >
                            <td className="px-4 py-2 pl-8">
                              {isGroupExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 mr-2">
                                {group.groupName}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{group.sampleCount}</td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              ¥{group.totalCost.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{group.ratio}%</td>
                          </tr>
                          {/* 物料明细行 */}
                          {isGroupExpanded &&
                            group.materials.map((mat) => (
                              <tr key={mat.materialId} className="bg-gray-50/30">
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2 pl-12 text-gray-600 text-xs">
                                  {mat.materialName}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-500 text-xs">
                                  {mat.quantity}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600 text-xs">
                                  ¥{mat.totalCost.toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                  {mat.ratio}%
                                </td>
                              </tr>
                            ))}
                        </>
                      )
                    })}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
