import { Download, Upload } from 'lucide-react'
import { CaseListTab } from './components/CaseListTab'
import { EditCaseModal } from './components/EditCaseModal'
import { FixBomModal } from './components/FixBomModal'
import { ImportLisModal } from './components/ImportLisModal'
import { LogListTab } from './components/LogListTab'
import { ReconcileProjectTab } from './components/ReconcileProjectTab'
import { useReconciliationPage, type TabType, type PeriodType } from './hooks/useReconciliationPage'

const tabs: Array<{ key: TabType; label: string }> = [
  { key: 'reconcile', label: '按项目对账' },
  { key: 'material', label: '按物料汇总' },
  { key: 'case', label: '按病理号查看' },
  { key: 'log', label: '修正日志' },
]

const periods: Array<{ key: PeriodType; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季' },
  { key: 'year', label: '本年' },
]

export default function Reconciliation() {
  const page = useReconciliationPage()

  const stats = [
    { label: 'LIS病例总数', value: page.summary?.totalCases || 0 },
    { label: '系统出库关联数', value: page.summary?.linkedOutbounds || 0 },
    { label: '未关联出库', value: page.summary?.unlinkedOutbounds || 0 },
    { label: '病例缺失', value: page.summary?.projectsWithoutBom || 0 },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">消耗对账</h1>
          <p className="mt-1 text-sm text-gray-500">对齐 LIS 病例量、BOM 理论消耗和实际出库，形成可处理的成本差异。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={page.handleExport}
            disabled={page.exporting}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {page.exporting ? '导出中...' : '导出报表'}
          </button>
          <button
            type="button"
            onClick={() => page.setImportModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            导入LIS数据
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(item => (
          <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>对账说明：</strong>项目物料差异可触发审计，异常会进入成本异常台账，关账前需要处理 error 级差异。
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          {periods.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => page.setPeriod(item.key)}
              className={`h-8 rounded-md px-3 text-sm font-medium ${page.period === item.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={page.startDate}
            onChange={event => page.setStartDate(event.target.value)}
            className="h-8 rounded-md border border-gray-300 px-2 text-sm"
          />
          <span className="text-sm text-gray-400">至</span>
          <input
            type="date"
            value={page.endDate}
            onChange={event => page.setEndDate(event.target.value)}
            className="h-8 rounded-md border border-gray-300 px-2 text-sm"
          />
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => page.setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-3 text-sm font-medium ${page.activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {page.activeTab === 'reconcile' && (
        <ReconcileProjectTab
          loading={page.loading}
          projects={page.projects}
          expandedProject={page.expandedProject}
          projectMaterials={page.projectMaterials}
          onToggleProject={page.loadProjectMaterials}
          getDiffClass={page.getDiffClass}
          onFixBom={page.openFixBomModal}
          onAuditProject={page.handleAuditProject}
          auditingProjectId={page.auditingProjectId}
        />
      )}

      {page.activeTab === 'material' && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">物料</th>
                  <th className="px-4 py-3 text-right">理论消耗</th>
                  <th className="px-4 py-3 text-right">实际出库</th>
                  <th className="px-4 py-3 text-right">差异</th>
                  <th className="px-4 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {page.materials.map(item => (
                  <tr key={item.materialId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.materialName}</div>
                      <div className="text-xs text-gray-500">{item.spec}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{Number(item.theoryTotal || 0).toFixed(1)} {item.unit}</td>
                    <td className="px-4 py-3 text-right">{Number(item.actualTotal || 0).toFixed(1)} {item.unit}</td>
                    <td className="px-4 py-3 text-right">{Number(item.diff || 0).toFixed(1)} ({item.diffRate}%)</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${page.getDiffClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.materials.length === 0 && !page.loading && (
            <div className="py-12 text-center text-gray-400">暂无数据</div>
          )}
        </div>
      )}

      {page.activeTab === 'case' && (
        <CaseListTab
          caseSearch={page.caseSearch}
          setCaseSearch={page.setCaseSearch}
          caseFilterProject={page.caseFilterProject}
          setCaseFilterProject={page.setCaseFilterProject}
          caseFilterStatus={page.caseFilterStatus}
          setCaseFilterStatus={page.setCaseFilterStatus}
          casePagination={page.casePagination}
          projects={page.projects}
          getStatusBadge={page.getStatusBadge}
          getStatusLabel={page.getStatusLabel}
          onEditCase={page.openEditCaseModal}
          onReset={page.resetCaseFilters}
          onExport={page.handleExport}
          exporting={page.exporting}
        />
      )}

      {page.activeTab === 'log' && <LogListTab logPagination={page.logPagination} />}

      <ImportLisModal
        open={page.importModalOpen}
        importData={page.importData}
        setImportData={page.setImportData}
        importErrors={page.importErrors}
        onClose={() => page.setImportModalOpen(false)}
        onConfirm={page.handleImport}
      />
      <FixBomModal
        open={page.fixBomModalOpen}
        fixTarget={page.fixTarget}
        fixTargetProjectId={page.fixTargetProjectId}
        fixNewUsage={page.fixNewUsage}
        setFixNewUsage={page.setFixNewUsage}
        fixNewUnit={page.fixNewUnit}
        setFixNewUnit={page.setFixNewUnit}
        fixReason={page.fixReason}
        setFixReason={page.setFixReason}
        onClose={() => page.setFixBomModalOpen(false)}
        onConfirm={page.handleFixBom}
      />
      <EditCaseModal
        open={page.editCaseModalOpen}
        editCaseTarget={page.editCaseTarget}
        editCaseProjectId={page.editCaseProjectId}
        setEditCaseProjectId={page.setEditCaseProjectId}
        editCaseStatus={page.editCaseStatus}
        setEditCaseStatus={page.setEditCaseStatus}
        projects={page.projects}
        onClose={() => page.setEditCaseModalOpen(false)}
        onConfirm={page.handleEditCase}
      />
    </div>
  )
}
