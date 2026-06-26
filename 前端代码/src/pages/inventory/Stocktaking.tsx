import { useState } from 'react'
import { Plus, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStocktakingPage, statusOptions } from './hooks/useStocktakingPage'
import { StocktakingTable } from './components/StocktakingTable'
import { StocktakingCreateModal } from './components/StocktakingCreateModal'
import { StocktakingBatchModal } from './components/StocktakingBatchModal'
import { StocktakingDetailModal } from './components/StocktakingDetailModal'
import { StocktakingDeleteModal } from './components/StocktakingDeleteModal'
import { StocktakingAdjustModal } from './components/StocktakingAdjustModal'

export default function Stocktaking() {
  const page = useStocktakingPage()
  const navigate = useNavigate()
  const [batchOpen, setBatchOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight tracking-tight">库存盘点</h1>
          <p className="mt-1 text-sm text-gray-500">管理库存盘点任务，确保账实相符</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setBatchOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 text-sm font-medium transition-colors">
            <Layers className="w-4 h-4" />批量盘点
          </button>
          <button onClick={page.openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium shadow-sm transition-colors">
            <Plus className="w-4 h-4" />新建盘点
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.confirmed}</div>
          <div className="mt-1 text-sm text-gray-500">已确认</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.completed}</div>
          <div className="mt-1 text-sm text-gray-500">已完成</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-amber-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.diffCount}</div>
          <div className="mt-1 text-sm text-gray-500">待处理差异</div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
          <div className="text-2xl font-semibold text-gray-900">{page.stats.accuracy}%</div>
          <div className="mt-1 text-sm text-gray-500">账实相符率</div>
        </div>
      </div>

      {/* Table */}
      <StocktakingTable
        data={page.data}
        loading={page.loading}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        keyword={page.keyword}
        statusFilter={page.statusFilter}
        statusOptions={statusOptions}
        onKeywordChange={page.setKeyword}
        onStatusFilterChange={page.setStatusFilter}
        onQuery={page.handleQuery}
        onReset={page.handleReset}
        onPageChange={page.setPage}
        onPageSizeChange={page.setPageSize}
        onOpenDetail={page.openDetail}
        onOpenAdjust={page.openAdjust}
        onOpenDelete={page.openDelete}
      />

      {/* Create Modal */}
      <StocktakingCreateModal
        open={page.modalType === 'create'}
        form={page.form}
        createStep={page.createStep}
        materials={page.materials}
        inventoryRows={page.inventoryRows}
        createdRecord={page.createdRecord}
        isSubmitting={page.isSubmitting}
        onClose={() => page.setModalType(null)}
        onChange={page.setForm}
        onSetCreateStep={page.setCreateStep}
        onSubmit={page.handleCreateSubmit}
        onOpenAuditEvidence={(stocktakingNo) => navigate(`/logs?keyword=${encodeURIComponent(stocktakingNo)}`)}
      />

      {/* Batch Modal（P1-04） */}
      <StocktakingBatchModal
        open={batchOpen}
        materials={page.materials}
        onClose={() => setBatchOpen(false)}
        onSubmitted={page.handleQuery}
      />

      {/* Detail Modal */}
      <StocktakingDetailModal
        open={page.modalType === 'detail'}
        row={page.detailRow}
        onClose={() => page.setModalType(null)}
        onAdjust={page.openAdjust}
      />

      {/* Delete Modal */}
      <StocktakingDeleteModal
        open={page.deleteConfirmOpen}
        row={page.recordToDelete}
        onClose={() => page.setDeleteConfirmOpen(false)}
        onConfirm={page.handleDelete}
      />

      {/* Adjust Modal */}
      <StocktakingAdjustModal
        open={page.modalType === 'adjust'}
        row={page.detailRow}
        onClose={() => page.setModalType(null)}
        onConfirm={page.handleAdjustConfirm}
        submitting={page.isSubmitting}
      />
    </div>
  )
}
