import { Download, FileText, Plus, CheckCircle2, PauseCircle, AlertTriangle } from 'lucide-react'
import { useBOMPage } from './hooks/useBOMPage'
import { BOMTable } from './components/BOMTable'
import { BOMFormModal } from './components/BOMFormModal'
import { BOMDetailModal } from './components/BOMDetailModal'
import { BOMCopyModal } from './components/BOMCopyModal'
import { BOMDeleteModal } from './components/BOMDeleteModal'
import { BOMBatchImpactModal } from './components/BOMBatchImpactModal'
import { BOMExportModal } from './components/BOMExportModal'
import { StatCard } from './components/StatCard'

export default function BOMList() {
  const page = useBOMPage()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
            BOM清单
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            管理检测项目物料清单、版本和库存支撑状态
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => page.setModalType('export')}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />导出
          </button>
          {page.canWrite && (
            <button
              onClick={page.openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" />新建BOM
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="BOM总数" value={page.stats.total} icon={FileText} colorClass="bg-blue-50 text-blue-600" />
        <StatCard label="已启用" value={page.stats.active} icon={CheckCircle2} colorClass="bg-green-50 text-green-600" />
        <StatCard label="已停用" value={page.stats.inactive} icon={PauseCircle} colorClass="bg-gray-100 text-gray-600" />
        <StatCard label="可支撑偏低" value={page.stats.lowSupport} icon={AlertTriangle} colorClass="bg-amber-50 text-amber-600" />
      </div>

      <BOMTable
        data={page.data}
        loading={page.loading}
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        searchInput={page.searchInput}
        filterType={page.filterType}
        filterStatus={page.filterStatus}
        quickFilter={page.quickFilter}
        selectedIds={page.selectedIds}
        canWrite={page.canWrite}
        isAllSelected={page.isAllSelected}
        isIndeterminate={page.isIndeterminate}
        onSearchInputChange={page.setSearchInput}
        onSearch={page.handleSearch}
        onReset={page.handleReset}
        onFilterTypeChange={(value) => { page.setFilterType(value); page.setPage(1) }}
        onFilterStatusChange={(value) => { page.setFilterStatus(value); page.setPage(1) }}
        onQuickFilterChange={page.setQuickFilter}
        onToggleSelectAll={page.toggleSelectAll}
        onToggleSelectRow={page.toggleSelectRow}
        onClearSelection={page.clearSelection}
        onPageChange={page.setPage}
        onPageSizeChange={page.setPageSize}
        onOpenDetail={page.openDetail}
        onOpenEdit={page.openEdit}
        onOpenCopy={page.openCopy}
        onOpenDelete={page.openDelete}
        onBatchDelete={() => page.openBatchImpact('delete')}
        onBatchEnable={page.enableSelected}
        onBatchDisable={page.disableSelected}
        onToggleStatus={page.toggleStatus}
      />

      <BOMFormModal
        open={page.modalType === 'create' || page.modalType === 'edit'}
        type={page.modalType === 'edit' ? 'edit' : 'create'}
        form={page.form}
        allMaterials={page.allMaterials}
        allProjects={page.allProjects}
        allEquipment={page.allEquipment}
        onClose={page.closeModal}
        onChange={page.setForm}
        onSubmit={page.handleSubmit}
      />

      <BOMDetailModal
        open={page.modalType === 'detail'}
        bom={page.selectedBom}
        tab={page.detailTab}
        onClose={page.closeModal}
        onChangeTab={page.setDetailTab}
        onEdit={() => page.selectedBom && page.openEdit(page.selectedBom)}
      />

      <BOMCopyModal
        open={page.modalType === 'copy'}
        editingId={page.editingId}
        copyForm={page.copyForm}
        data={page.selectedBom ? [page.selectedBom, ...page.data] : page.data}
        onClose={page.closeModal}
        onChange={page.setCopyForm}
        onConfirm={page.handleCopyConfirm}
      />

      <BOMDeleteModal
        open={page.modalType === 'delete'}
        editingId={page.editingId}
        data={page.data}
        deleteCheck={page.deleteCheck}
        checkingDelete={page.checkingDelete}
        isSubmitting={page.loading}
        onClose={page.closeModal}
        onConfirm={page.handleDeleteConfirm}
      />

      <BOMBatchImpactModal
        open={page.modalType === 'batchImpact'}
        action={page.batchAction}
        targetsCount={page.batchTargets.length}
        deleteResults={page.batchDeleteResults}
        statusResults={page.batchStatusResults}
        checking={page.checkingBatch}
        submitting={page.loading}
        onClose={page.closeModal}
        onConfirm={page.handleBatchActionConfirm}
      />

      <BOMExportModal
        open={page.modalType === 'export'}
        form={page.exportForm}
        selectedCount={page.selectedIds.size}
        onClose={page.closeModal}
        onChange={page.setExportForm}
        onConfirm={page.handleExport}
      />
    </div>
  )
}
