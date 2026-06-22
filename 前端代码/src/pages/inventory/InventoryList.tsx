import { ShieldCheck, Upload } from 'lucide-react'
import { useInventoryPage } from './hooks/useInventoryPage'
import { InventoryTable } from './components/InventoryTable'
import { DepletionTab } from './components/DepletionTab'
import { DepletedTab } from './components/DepletedTab'
import { InventoryConsistencyModal } from './components/InventoryConsistencyModal'
import { OutboundModal } from './components/OutboundModal'
import { MaterialSelectorModal } from './components/MaterialSelectorModal'
import { InventoryDetailModal } from './components/InventoryDetailModal'
import { BatchOutboundModal } from './components/BatchOutboundModal'
import { BatchScrapModal } from './components/BatchScrapModal'
import { EditRemainModal } from './components/EditRemainModal'
import { ConfirmDepleteModal } from './components/ConfirmDepleteModal'

export default function InventoryList() {
  const page = useInventoryPage()

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">库存列表</h1>
          <p className="text-sm text-gray-500 mt-1">管理实验室耗材库存，实时监控库存状态和有效期</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={page.runConsistencyCheck}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 ease hover:bg-gray-50"
          >
            <ShieldCheck className="w-4 h-4" />
            数据诊断
          </button>
          {page.canManageInventoryActions && (
            <button
              onClick={() => page.setOutboundModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-all duration-150 ease text-sm font-medium shadow-sm"
            >
              <Upload className="w-4 h-4" />
              出库登记
            </button>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-0 border-b border-gray-200">
        {[
          { key: 'in-stock' as const, label: '在库' },
          ...(page.canAccessDepletion
            ? [
                { key: 'in-use' as const, label: '使用中' },
                { key: 'depleted' as const, label: '已耗尽' },
              ]
            : []),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => page.setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-all duration-150 ease relative ${
              page.activeTab === tab.key
                ? 'text-blue-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {page.activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {page.activeTab === 'in-stock' && (
        <InventoryTable
          data={page.data}
          loading={page.loading}
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
          keyword={page.keyword}
          category={page.category}
          location={page.location}
          categoryOptions={page.categoryOptions}
          locationOptions={page.locationOptions}
          quickFilter={page.quickFilter}
          sortField={page.sortField}
          sortDirection={page.sortDirection}
          selectedIds={page.selectedIds}
          expandedGroups={page.expandedGroups}
          stats={page.computedStats}
          quickFilterCounts={page.quickFilterCounts}
          onKeywordChange={page.setKeyword}
          onCategoryChange={page.setCategory}
          onLocationChange={page.setLocation}
          onQuickFilter={page.handleQuickFilter}
          onSort={page.handleSort}
          onSearch={page.handleSearch}
          onReset={page.handleReset}
          onToggleSelectAll={page.toggleSelectAll}
          onToggleSelectOne={page.toggleSelectOne}
          onClearSelection={page.clearSelection}
          onToggleGroup={page.toggleGroup}
          onDetail={page.viewDetail}
          onOutbound={page.openOutboundModal}
          onPageChange={page.setPage}
          onPageSizeChange={page.setPageSize}
          onBatchOutbound={page.openBatchOutbound}
          onBatchScrap={page.openBatchScrap}
          canManageInventoryActions={page.canManageInventoryActions}
        />
      )}

      {page.activeTab === 'in-use' && (
        <DepletionTab
          items={page.depletionTracking}
          canManage={page.canManageDepletionActions}
          onEditRemain={(dep) => {
            page.setSelectedDepletionItem(dep)
            page.setEditRemainValue(String(dep.remaining))
            page.setEditRemainReason('')
            page.setEditRemainModalOpen(true)
          }}
          onConfirmDeplete={(dep) => {
            page.setSelectedDepletionItem(dep)
            page.setDepleteType('normal')
            page.setDepleteRemainValue('0')
            page.setExpiredReason('')
            page.setExpiredRemark('')
            page.setConfirmDepleteModalOpen(true)
          }}
        />
      )}

      {page.activeTab === 'depleted' && (
        <DepletedTab records={page.depletedRecords} />
      )}

      <OutboundModal
        open={page.outboundModalOpen}
        materials={page.outboundMaterials}
        remark={page.outboundRemark}
        projectList={page.projectList}
        userList={page.userList}
        onClose={() => page.setOutboundModalOpen(false)}
        onAddMaterial={page.openMaterialSelector}
        onRemoveItem={page.removeOutboundItem}
        onUpdateQuantity={page.updateOutboundQuantity}
        onUpdateProject={page.updateOutboundProject}
        onUpdateUser={page.updateOutboundUser}
        onUpdateUsage={page.updateOutboundUsage}
        onUpdateReceiver={page.updateOutboundReceiver}
        onChangeRemark={page.setOutboundRemark}
        onConfirm={page.confirmOutbound}
      />

      <InventoryConsistencyModal
        open={page.consistencyModalOpen}
        loading={page.consistencyLoading}
        result={page.consistencyResult}
        onClose={() => page.setConsistencyModalOpen(false)}
        onRefresh={page.runConsistencyCheck}
      />

      <MaterialSelectorModal
        open={page.materialSelectorOpen}
        tab={page.materialSelectorTab}
        materialList={page.materialList}
        materialLoading={page.materialLoading}
        materialKeyword={page.materialKeyword}
        checkedMaterialIds={page.checkedMaterialIds}
        selectedMaterials={page.selectedMaterials}
        bomList={page.bomList}
        selectedBomId={page.selectedBomId}
        bomMaterials={page.bomMaterials}
        bomLoading={page.bomLoading}
        onClose={() => page.setMaterialSelectorOpen(false)}
        onSwitchTab={(tab) => {
          page.setMaterialSelectorTab(tab)
          if (tab === 'bom') page.fetchBomList()
        }}
        onChangeKeyword={page.setMaterialKeyword}
        onToggleCheck={page.toggleCheckMaterial}
        onToggleCheckAll={page.toggleCheckAllMaterials}
        onRemoveSelected={page.removeSelectedMaterial}
        onAddChecked={page.addCheckedToSelected}
        onConfirm={page.confirmAddMaterials}
        onSelectBom={(id) => {
          page.setSelectedBomId(id)
          page.loadBomDetail(id)
        }}
        filteredMaterialList={page.filteredMaterialList}
      />

      <InventoryDetailModal
        open={page.detailModalOpen}
        item={page.selectedItem}
        batchTrace={page.batchTrace}
        batchTraceLoading={page.batchTraceLoading}
        onClose={() => page.setDetailModalOpen(false)}
        onOutbound={() => page.selectedItem && page.openOutboundModal(page.selectedItem)}
        canManageInventoryActions={page.canManageInventoryActions}
      />

      <BatchOutboundModal
        open={page.batchOutboundModalOpen}
        selectedCount={page.selectedIds.size}
        onClose={() => page.setBatchOutboundModalOpen(false)}
        onConfirm={page.confirmBatchOutboundOnly}
      />

      <BatchScrapModal
        open={page.batchScrapModalOpen}
        items={page.data.filter(i => page.selectedIds.has(i.id))}
        scrapReason={page.scrapReason}
        scrapRemark={page.scrapRemark}
        responsiblePerson={page.scrapResponsiblePerson}
        responsibleDepartment={page.scrapResponsibleDepartment}
        onClose={() => page.setBatchScrapModalOpen(false)}
        onConfirm={page.confirmBatchScrap}
        onChangeReason={page.setScrapReason}
        onChangeRemark={page.setScrapRemark}
        onChangeResponsiblePerson={page.setScrapResponsiblePerson}
        onChangeResponsibleDepartment={page.setScrapResponsibleDepartment}
      />

      <EditRemainModal
        open={page.editRemainModalOpen}
        item={page.selectedDepletionItem}
        remainValue={page.editRemainValue}
        reason={page.editRemainReason}
        onClose={() => page.setEditRemainModalOpen(false)}
        onChangeValue={page.setEditRemainValue}
        onChangeReason={page.setEditRemainReason}
        onConfirm={page.confirmEditRemain}
      />

      <ConfirmDepleteModal
        open={page.confirmDepleteModalOpen}
        item={page.selectedDepletionItem}
        depleteType={page.depleteType}
        remainValue={page.depleteRemainValue}
        expiredReason={page.expiredReason}
        expiredRemark={page.expiredRemark}
        onClose={() => page.setConfirmDepleteModalOpen(false)}
        onChangeType={page.setDepleteType}
        onChangeRemainValue={page.setDepleteRemainValue}
        onChangeExpiredReason={page.setExpiredReason}
        onChangeExpiredRemark={page.setExpiredRemark}
        onConfirm={page.confirmDeplete}
      />
    </div>
  )
}
