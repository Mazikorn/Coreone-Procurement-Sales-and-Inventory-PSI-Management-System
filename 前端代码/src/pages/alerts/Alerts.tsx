import { Clock } from 'lucide-react'
import { buildAlertHandleRemark, useAlertsPage } from './hooks/useAlertsPage'
import { AlertTable } from './components/AlertTable'
import { AlertHandleModal } from './components/AlertHandleModal'
import { AlertConsumptionHandleModal } from './components/AlertConsumptionHandleModal'
import { AlertDetailModal } from './components/AlertDetailModal'
import { AlertConsumptionDetailModal } from './components/AlertConsumptionDetailModal'

export default function Alerts() {
  const page = useAlertsPage()

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight tracking-tight">
            预警中心
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            查看和处理库存、批次有效期与消耗异常预警
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={page.openHistory}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-150 h-10"
          >
            <Clock className="w-4 h-4" />
            查看历史
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-red-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.pending}</div>
          <div className="mt-1 text-sm text-gray-500">待处理</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.processed}</div>
          <div className="mt-1 text-sm text-gray-500">已处理</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-yellow-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.today}</div>
          <div className="mt-1 text-sm text-gray-500">今日预警</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.month}</div>
          <div className="mt-1 text-sm text-gray-500">本月预警</div>
        </div>
      </div>

      {/* 表格区域 */}
      <AlertTable
        data={page.data}
        loading={page.loading}
        error={page.error}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        filter={page.filter}
        quickFilter={page.quickFilter}
        selectedIds={page.selectedIds}
        canHandle={page.canHandle}
        canCreatePurchaseOrders={page.canCreatePurchaseOrders}
        onFilterChange={(filter) => { page.setFilter(filter); page.setPage(1) }}
        onQuickFilterChange={(v) => { page.setQuickFilter(v); page.setPage(1) }}
        onResetFilters={page.resetFilters}
        onSelect={page.handleSelect}
        onSelectAll={page.handleSelectAll}
        onClearSelection={page.clearSelection}
        onPageChange={page.setPage}
        onPageSizeChange={page.setPageSize}
        onRetry={page.refresh}
        onBatchProcess={page.handleBatchProcess}
        onOpenModal={page.openModal}
        onIgnore={page.handleIgnore}
        getAlertTypeInfo={page.getAlertTypeInfo}
        getStatusInfo={page.getStatusInfo}
        isConsumption={page.isConsumption}
        formatDate={page.formatDate}
      />

      {/* 弹窗 */}
      <AlertHandleModal
        open={page.modal.type === 'handle'}
        alert={page.modal.alert}
        form={page.handleForm}
        onClose={page.closeModal}
        onChange={page.setHandleForm}
        onConfirm={() => {
          if (page.modal.alert) page.handleProcess(page.modal.alert.id, buildAlertHandleRemark(page.handleForm))
        }}
      />

      <AlertConsumptionHandleModal
        open={page.modal.type === 'consumption-handle'}
        alert={page.modal.alert}
        form={page.handleForm}
        onClose={page.closeModal}
        onChange={page.setHandleForm}
        onConfirm={() => {
          if (page.modal.alert) page.handleProcess(page.modal.alert.id, buildAlertHandleRemark(page.handleForm))
        }}
      />

      <AlertDetailModal
        open={page.modal.type === 'detail'}
        alert={page.modal.alert}
        onClose={page.closeModal}
        canHandle={page.canHandle}
        canCreatePurchaseOrders={page.canCreatePurchaseOrders}
        onHandle={() => {
          if (page.modal.alert) page.openModal('handle', page.modal.alert)
        }}
        formatDate={page.formatDate}
      />

      <AlertConsumptionDetailModal
        open={page.modal.type === 'consumption-detail'}
        alert={page.modal.alert}
        onClose={page.closeModal}
        canHandle={page.canHandle}
        onHandle={() => {
          if (page.modal.alert) page.openModal('consumption-handle', page.modal.alert)
        }}
        formatDate={page.formatDate}
      />
    </div>
  )
}
