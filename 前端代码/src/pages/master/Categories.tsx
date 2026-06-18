import { FolderTree, Plus } from 'lucide-react'
import { useCategoriesPage } from './hooks/useCategoriesPage'
import { CategoryTree } from './components/CategoryTree'
import { CategoryDetail } from './components/CategoryDetail'
import { CategoryFormModal } from './components/CategoryFormModal'
import { CategoryDeleteModal } from './components/CategoryDeleteModal'
import { MaterialMigrateModal } from './components/MaterialMigrateModal'

export default function Categories() {
  const page = useCategoriesPage()
  const breadcrumb = page.selectedId ? page.getBreadcrumb(page.selectedId) : []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-gray-900">
            物料分类
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            管理耗材分类层级，维护分类下的物料归属与迁移
          </p>
        </div>
        <button
          onClick={() => page.openCreate(null, 1)}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" />
          新建分类
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-semibold text-blue-600">{page.stats.total}</div>
          <div className="mt-1 text-sm text-gray-500">分类总数</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-semibold text-green-600">{page.stats.level3}</div>
          <div className="mt-1 text-sm text-gray-500">末级分类</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-semibold text-amber-600">{page.stats.totalMaterials}</div>
          <div className="mt-1 text-sm text-gray-500">关联物料</div>
        </div>
      </div>

      <div className="flex min-h-[560px] flex-col gap-5 xl:flex-row">
        <CategoryTree
          tree={page.tree}
          loading={page.loading}
          expandedIds={page.expandedIds}
          selectedId={page.selectedId}
          searchKeyword={page.searchKeyword}
          onToggleExpand={page.toggleExpand}
          onSelectNode={page.setSelectedId}
          onSearchKeywordChange={page.setSearchKeyword}
          onOpenCreate={page.openCreate}
          onOpenEdit={page.openEdit}
          onOpenDelete={page.openDelete}
          filterMatch={page.filterMatch}
        />

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <CategoryDetail
            node={page.selectedNode}
            breadcrumb={breadcrumb}
            materials={page.categoryMaterials}
            materialsLoading={page.materialsLoading}
            materialTotal={page.materialTotal}
            materialKeyword={page.materialKeyword}
            onEdit={page.openEdit}
            onAddChild={page.openCreate}
            onSearchMaterial={page.handleMaterialSearch}
            onLoadMore={page.loadMoreMaterials}
            onMigrate={page.openMigrate}
          />
        </div>
      </div>

      {page.tree.length === 0 && !page.loading && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white px-5 py-4 text-sm text-gray-500">
          <FolderTree className="h-5 w-5 text-gray-400" />
          当前还没有分类。可以先新建一级分类，再逐级添加子分类。
        </div>
      )}

      <CategoryFormModal
        open={page.modalOpen}
        editingId={page.editingId}
        form={page.form}
        flatList={page.flatList}
        onClose={() => page.setModalOpen(false)}
        onChange={page.setForm}
        onSubmit={page.handleSubmit}
      />

      <CategoryDeleteModal
        open={page.deleteModalOpen}
        target={page.deleteTarget}
        onClose={() => page.setDeleteModalOpen(false)}
        onConfirm={page.confirmDelete}
      />

      <MaterialMigrateModal
        open={page.migrateModalOpen}
        material={page.migrateTarget}
        currentCategory={page.selectedNode}
        categories={page.flatList}
        onClose={() => page.setMigrateModalOpen(false)}
        onConfirm={page.confirmMigrate}
      />
    </div>
  )
}
