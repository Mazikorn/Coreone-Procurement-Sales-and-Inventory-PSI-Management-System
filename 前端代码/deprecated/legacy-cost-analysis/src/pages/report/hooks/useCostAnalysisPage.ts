import { useState, useEffect, useMemo } from 'react'
import { reportsApi } from '@/api/reports'
import type { ProjectCostReport, MaterialCostReport, SupplierCostReport, FullCostReport } from '@/types'
import { toast } from 'sonner'
import { useUrlParams } from '@/hooks/useUrlParams'

export type TabKey = 'project-cost' | 'project-group-cost' | 'material-cost' | 'public-cost' | 'supplier-cost' | 'full-cost'
export type CostExportSection = 'summary' | 'project' | 'group' | 'material' | 'supplier' | 'full' | 'trend'

export interface GroupCostReport {
  summary: {
    totalCost: number
    projectCount: number
  }
  projects: Array<{
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
}

function getDateRange(value: string): [string, string] | null {
  const yearMatch = value.match(/^(\d{4})$/)
  if (yearMatch) {
    const year = yearMatch[1]
    return [`${year}-01-01`, `${year}-12-31`]
  }

  const quarterMatch = value.match(/^(\d{4})q([1-4])$/)
  if (quarterMatch) {
    const year = Number(quarterMatch[1])
    const quarter = Number(quarterMatch[2])
    const startMonth = (quarter - 1) * 3
    const start = new Date(year, startMonth, 1)
    const end = new Date(year, startMonth + 3, 0)
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
  }

  return null
}

export interface CostAnalysisStats {
  totalCost: number
  projectCost: number
  publicCost: number
  totalSamples: number
  avgCost: number
}

export interface TrendData {
  month: string
  cost: number
}

export interface TrendReport {
  trend: TrendData[]
}

export interface PieDataItem {
  name: string
  value: number
}

export function useCostAnalysisPage() {
  const [projectReport, setProjectReport] = useState<ProjectCostReport | null>(null)
  const [groupCostReport, setGroupCostReport] = useState<GroupCostReport | null>(null)
  const [materialReport, setMaterialReport] = useState<MaterialCostReport | null>(null)
  const [supplierReport, setSupplierReport] = useState<SupplierCostReport | null>(null)
  const [fullCostReport, setFullCostReport] = useState<FullCostReport | null>(null)
  const [trendReport, setTrendReport] = useState<TrendReport | null>(null)
  const [loading, setLoading] = useState(false)

  const { get, getNumber, setMultiple } = useUrlParams()

  const currentYear = new Date().getFullYear()
  const initialRange = getDateRange(String(currentYear)) || [`${currentYear}-01-01`, `${currentYear}-12-31`]

  const [activeTab, setActiveTab] = useState<TabKey>((get('tab') as TabKey) || 'project-cost')
  const [searchText, setSearchText] = useState(get('search') || '')
  const [projectFilter, setProjectFilter] = useState('')
  const [startDate, setStartDate] = useState(initialRange[0])
  const [endDate, setEndDate] = useState(initialRange[1])
  const [timeRange, setTimeRange] = useState(String(currentYear))
  const [page, setPage] = useState(Math.max(1, getNumber('page', 1)))
  const [pageSize, setPageSize] = useState(Math.max(1, Math.min(100, getNumber('pageSize', 10))))
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportSections, setExportSections] = useState<Record<CostExportSection, boolean>>({
    summary: true,
    project: true,
    group: false,
    material: true,
    supplier: false,
    full: true,
    trend: false,
  })
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectCostReport['projects'][number] | FullCostReport['projects'][number] | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const dateParams = {
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      }

      const [pRes, gRes, mRes, sRes, tRes, fRes] = await Promise.all([
        reportsApi.getCostByProject(dateParams),
        reportsApi.getCostByProjectGroup(dateParams),
        reportsApi.getCostByMaterial(dateParams),
        reportsApi.getCostBySupplier(dateParams),
        reportsApi.getCostTrend(dateParams),
        reportsApi.getFullCostByProject(dateParams),
      ])
      setProjectReport(pRes)
      setGroupCostReport(gRes)
      setMaterialReport(mRes)
      setSupplierReport(sRes)
      setTrendReport(tRes)
      setFullCostReport(fRes)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    fetchData()
  }, [startDate, endDate])

  useEffect(() => {
    setPage(1)
  }, [activeTab, searchText, projectFilter])

  useEffect(() => {
    const params: Record<string, string | null> = {}
    params.tab = activeTab === 'project-cost' ? null : activeTab
    params.search = searchText || null
    params.page = page === 1 ? null : String(page)
    params.pageSize = pageSize === 10 ? null : String(pageSize)
    setMultiple(params)
  }, [activeTab, searchText, page, pageSize])

  const handleTimeRangeChange = (val: string) => {
    setTimeRange(val)
    const range = getDateRange(val)
    if (range) {
      setStartDate(range[0])
      setEndDate(range[1])
      toast.success('时间范围已更新')
    }
  }

  const handleExport = async () => {
    const selectedSections = Object.entries(exportSections)
      .filter(([, selected]) => selected)
      .map(([key]) => key as CostExportSection)
    if (selectedSections.length === 0) {
      toast.warning('请至少选择一项报告内容')
      return
    }

    const hasData =
      Boolean(projectReport?.projects?.length) ||
      Boolean(groupCostReport?.projects?.length) ||
      Boolean(materialReport?.materials?.length) ||
      Boolean(supplierReport?.suppliers?.length) ||
      Boolean(fullCostReport?.projects?.length) ||
      Boolean(trendReport?.trend?.length)

    if (!hasData) {
      toast.warning('暂无数据可导出')
      return
    }

    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()

      if (exportSections.summary) XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
          { 指标: '总成本', 数值: stats.totalCost },
          { 指标: '项目成本', 数值: stats.projectCost },
          { 指标: '公共成本', 数值: stats.publicCost },
          { 指标: '总样本数', 数值: stats.totalSamples },
          { 指标: '平均成本', 数值: stats.avgCost },
        ]),
        '汇总'
      )

      if (exportSections.project && projectReport?.projects?.length) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(projectReport.projects.map(project => ({
            检测项目: project.name,
            分类: project.category,
            病例数: project.sampleCount,
            单病例成本: project.unitCost,
            成本金额: project.totalCost,
            占比: project.ratio,
            同比变化: project.changeRate ?? '',
          }))),
          '项目成本'
        )
      }

      if (exportSections.group && groupCostReport?.projects?.length) {
        const rows = groupCostReport.projects.flatMap(project =>
          project.groups.flatMap(group =>
            group.materials.map(material => ({
              检测项目: project.projectName,
              组合: group.groupName,
              组合样本数: group.sampleCount,
              组合总成本: group.totalCost,
              物料名称: material.materialName,
              消耗数量: material.quantity,
              物料总成本: material.totalCost,
              占比: material.ratio,
            }))
          )
        )
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '项目组合成本')
      }

      if (exportSections.material && materialReport?.materials?.length) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(materialReport.materials.map(material => ({
            物料名称: material.name,
            规格型号: material.spec,
            消耗数量: material.consumption,
            单位: material.consumptionUnit,
            消耗金额: material.totalCost,
            占比: material.ratio,
            同比变化: material.changeRate ?? '',
          }))),
          '物料消耗'
        )
      }

      if (exportSections.supplier && supplierReport?.suppliers?.length) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(supplierReport.suppliers.map(supplier => ({
            供应商: supplier.name,
            金额: supplier.amount,
            占比: supplier.ratio,
            订单数: supplier.orderCount,
            状态: supplier.status,
          }))),
          '供应商分析'
        )
      }

      if (exportSections.full && fullCostReport?.projects?.length) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(fullCostReport.projects.map(project => ({
            检测项目: project.name,
            类型: project.type,
            样本数: project.sampleCount,
            物料成本: project.materialCost,
            人工成本: project.laborCost,
            设备成本: project.equipmentCost,
            质控成本: project.qcCost,
            间接成本: project.indirectCost,
            总成本: project.totalCost,
            单位成本: project.unitCost,
          }))),
          '全成本'
        )
      }

      if (exportSections.trend && trendReport?.trend?.length) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(trendReport.trend.map(item => ({
            月份: item.month,
            成本: item.cost,
          }))),
          '成本趋势'
        )
      }

      if (workbook.SheetNames.length === 0) {
        toast.warning('所选内容暂无数据可导出')
        return
      }

      XLSX.writeFile(workbook, `成本分析报告_${startDate}_${endDate}.xlsx`)
      toast.success('报告导出成功')
      setExportModalOpen(false)
    } catch (e) {
      console.error(e)
      toast.error('报告导出失败')
    }
  }

  const openDetailModal = (project: ProjectCostReport['projects'][number] | FullCostReport['projects'][number]) => {
    setSelectedProject(project)
    setDetailModalOpen(true)
  }

  const stats = useMemo<CostAnalysisStats>(() => {
    const totalCost = projectReport?.summary?.totalCost || 0
    const projectCost = projectReport?.summary?.projectCost || 0
    const publicCost = projectReport?.summary?.publicCost || 0
    const totalSamples = projectReport?.summary?.totalSamples || 0
    const avgCost = totalSamples > 0 ? Math.round(totalCost / totalSamples) : 0
    return { totalCost, projectCost, publicCost, totalSamples, avgCost }
  }, [projectReport])

  const filteredProjects = useMemo(() => {
    let list = projectReport?.projects || []
    if (searchText) {
      list = list.filter(p => p.name.includes(searchText))
    }
    if (projectFilter) {
      list = list.filter(p => p.category === projectFilter)
    }
    return list
  }, [projectReport, searchText, projectFilter])

  const filteredMaterials = useMemo(() => {
    let list = materialReport?.materials || []
    if (searchText) {
      list = list.filter(m => m.name.includes(searchText))
    }
    return list
  }, [materialReport, searchText])

  const pagedProjects = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredProjects.slice(start, start + pageSize)
  }, [filteredProjects, page, pageSize])

  const pagedMaterials = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredMaterials.slice(start, start + pageSize)
  }, [filteredMaterials, page, pageSize])

  const filteredFullCostProjects = useMemo(() => {
    let list = fullCostReport?.projects || []
    if (searchText) {
      list = list.filter(p => p.name.includes(searchText))
    }
    return list
  }, [fullCostReport, searchText])

  const pagedFullCostProjects = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredFullCostProjects.slice(start, start + pageSize)
  }, [filteredFullCostProjects, page, pageSize])

  const fullCostStats = useMemo(() => {
    const s = fullCostReport?.summary
    return {
      totalCost: s?.totalCost || 0,
      totalSamples: s?.totalSamples || 0,
      avgUnitCost: s?.avgUnitCost || 0,
      materialCost: s?.materialCost || 0,
      laborCost: s?.laborCost || 0,
      equipmentCost: s?.equipmentCost || 0,
      qcCost: s?.qcCost || 0,
      indirectCost: s?.indirectCost || 0,
    }
  }, [fullCostReport])

  const realSuppliers = supplierReport?.suppliers || []
  const totalSupplierAmount = realSuppliers.reduce((s: number, i: any) => s + (i.amount || 0), 0)

  const pieData = useMemo<PieDataItem[]>(() => {
    const projects = projectReport?.projects || []
    if (projects.length === 0) return []
    const total = projects.reduce((sum, p) => sum + (p.totalCost || 0), 0)
    if (total === 0) return []
    return projects.slice(0, 7).map(p => ({
      name: p.name,
      value: Number(((p.totalCost / total) * 100).toFixed(1)),
    }))
  }, [projectReport])

  return {
    projectReport,
    groupCostReport,
    materialReport,
    supplierReport,
    fullCostReport,
    trendReport,
    loading,
    activeTab,
    setActiveTab,
    searchText,
    setSearchText,
    projectFilter,
    setProjectFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    timeRange,
    setTimeRange,
    handleTimeRangeChange,
    page,
    setPage,
    pageSize,
    setPageSize,
    exportModalOpen,
    setExportModalOpen,
    exportSections,
    setExportSections,
    detailModalOpen,
    setDetailModalOpen,
    selectedProject,
    openDetailModal,
    stats,
    filteredProjects,
    filteredMaterials,
    pagedProjects,
    pagedMaterials,
    filteredFullCostProjects,
    pagedFullCostProjects,
    fullCostStats,
    pieData,
    realSuppliers,
    totalSupplierAmount,
    handleExport,
    fetchData,
  }
}
