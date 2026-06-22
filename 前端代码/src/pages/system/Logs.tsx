import { Download, Trash2 } from 'lucide-react'
import { useLogsPage, LOG_TYPES, MODULES, LOG_SOURCES } from './hooks/useLogsPage'
import { LogsTable } from './components/LogsTable'
import { LogDetailModal } from './components/LogDetailModal'
import { LogExportModal } from './components/LogExportModal'
import { LogCleanModal } from './components/LogCleanModal'
import { LogArchiveCredentialsPanel } from './components/LogArchiveCredentialsPanel'
import { getUserRole } from '@/lib/permissions'

export default function Logs() {
  const page = useLogsPage()
  const isAdmin = getUserRole() === 'admin'

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">审计日志</h1>
          <p className="text-sm text-gray-500 mt-1">按统一时间线回看操作、库存、成本和对账事实</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => page.setShowClean(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 text-sm font-medium shadow-sm transition-all">
              <Trash2 className="w-4 h-4" /> 清理操作日志
            </button>
          )}
          <button onClick={page.openExport} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium shadow-sm transition-all">
            <Download className="w-4 h-4" /> 导出审计日志
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.todayOps}</div>
          <div className="text-sm text-gray-500 mt-1">今日操作</div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-semibold text-blue-500">{page.stats.loginCount}</div>
          <div className="text-sm text-gray-500 mt-1">登录次数</div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-semibold text-yellow-600">{page.stats.dataChanges}</div>
          <div className="text-sm text-gray-500 mt-1">数据变更</div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-semibold text-green-500">{page.stats.activeUsers}</div>
          <div className="text-sm text-gray-500 mt-1">活跃用户</div>
        </div>
      </div>

      {isAdmin && (
        <LogArchiveCredentialsPanel
          archives={page.archiveCredentials}
          onVerify={page.handleVerifyArchiveChain}
          onExportReport={page.handleExportArchiveVerificationReport}
          verifying={page.verifyingArchiveChain}
          exportingReport={page.exportingArchiveReport}
          reportSignature={page.archiveReportSignature}
          verification={page.archiveVerification}
        />
      )}

      {/* Logs Table */}
      <LogsTable
        data={page.data}
        loading={page.loading}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        keyword={page.keyword}
        typeFilter={page.typeFilter}
        moduleFilter={page.moduleFilter}
        sourceFilter={page.sourceFilter}
        userFilter={page.userFilter}
        startDate={page.startDate}
        endDate={page.endDate}
        dateError={page.dateError}
        logTypes={LOG_TYPES}
        modules={MODULES}
        sources={LOG_SOURCES}
        users={page.userOptions}
        getLogType={page.getLogType}
        getAvatarChar={page.getAvatarChar}
        getModuleLabel={page.getModuleLabel}
        getSourceLabel={page.getSourceLabel}
        onKeywordChange={page.setKeyword}
        onTypeFilterChange={page.setTypeFilter}
        onModuleFilterChange={page.setModuleFilter}
        onSourceFilterChange={page.setSourceFilter}
        onUserFilterChange={page.setUserFilter}
        onStartDateChange={page.setStartDate}
        onEndDateChange={page.setEndDate}
        onSearch={page.handleSearch}
        onReset={page.handleReset}
        onPageChange={page.setPage}
        onPageSizeChange={page.setPageSize}
        onOpenDetail={page.openDetail}
      />

      {/* Detail Modal */}
      <LogDetailModal
        open={page.showDetail}
        log={page.detailLog}
        getLogType={page.getLogType}
        getModuleLabel={page.getModuleLabel}
        onClose={() => page.setShowDetail(false)}
      />

      {/* Export Modal */}
      <LogExportModal
        open={page.showExport}
        form={page.exportForm}
        dateError={page.exportDateError}
        contentError={page.exportContentError}
        onClose={() => page.setShowExport(false)}
        onChange={page.setExportForm}
        onExport={page.handleExport}
      />

      <LogCleanModal
        open={page.showClean}
        range={page.cleanRange}
        beforeDate={page.getCleanBeforeDate(page.cleanRange)}
        onClose={() => page.setShowClean(false)}
        onChange={page.setCleanRange}
        onConfirm={page.handleClean}
      />
    </div>
  )
}
