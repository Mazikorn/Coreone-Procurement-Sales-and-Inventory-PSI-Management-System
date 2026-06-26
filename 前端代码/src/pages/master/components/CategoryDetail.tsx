import { Folder, ChevronRight, Plus, Edit2, Package, Search, ArrowRightLeft, Loader2 } from 'lucide-react'
import type { Category, Material } from '@/types'

interface Props {
  node: Category | null
  breadcrumb: Category[]
  materials: Material[]
  materialsLoading: boolean
  materialTotal: number
  materialKeyword: string
  onEdit: (node: Category) => void
  onAddChild: (parentId: string, level: number) => void
  onSearchMaterial: (keyword: string) => void
  onLoadMore: () => void
  onMigrate: (material: Material) => void
}

export function CategoryDetail({
  node, breadcrumb, materials, materialsLoading, materialTotal, materialKeyword,
  onEdit, onAddChild, onSearchMaterial, onLoadMore, onMigrate,
}: Props) {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
          <Folder className="w-7 h-7 text-gray-300" />
        </div>
        <div className="text-base font-medium text-gray-900">选择分类查看详情</div>
        <p className="text-sm text-gray-500 mt-1 max-w-xs">从左侧分类树中点击任意分类，查看该分类下的物料信息和统计数据</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-900">{node.name}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(node)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            编辑
          </button>
          {node.level < 3 && (
            <button
              onClick={() => onAddChild(node.id, node.level + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加子分类
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-gray-500 mb-5 flex-wrap">
        {breadcrumb.map((item, idx, arr) => (
          <span key={item.id} className="flex items-center gap-1">
            <span className={idx === arr.length - 1 ? 'text-gray-900 font-medium' : ''}>{item.name}</span>
            {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          </span>
        ))}
      </div>

      {/* Basic Info */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">基本信息</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 rounded-lg p-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">分类名称</div>
            <div className="text-sm font-medium text-gray-900">{node.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">分类编码</div>
            <div className="text-sm font-mono text-gray-900">{node.code}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">分类层级</div>
            <div className="text-sm text-gray-900">
              {node.level === 1 ? '一级分类' : node.level === 2 ? '二级分类' : '三级分类'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">物料数量</div>
            <div className="text-sm text-gray-900">{node.count || 0}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">排序</div>
            <div className="text-sm text-gray-900">{node.sortOrder ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Associated materials */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900">
            关联物料
            {node.count > 0 && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">({node.count})</span>
            )}
          </h4>
        </div>

        {/* Material search */}
        {node.count > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索物料编码或名称..."
              value={materialKeyword}
              onChange={e => onSearchMaterial(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
            {materialKeyword && (
              <button
                onClick={() => onSearchMaterial('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
        )}

        {materialsLoading && materials.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center text-sm text-gray-400">加载中...</div>
        ) : materials.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <Package className="w-8 h-8 text-gray-300" />
              <span className="text-sm text-gray-400">
                {materialKeyword ? '未找到匹配的物料' : '该分类下暂无物料'}
              </span>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">物料编码</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">名称</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">规格</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">状态</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materials.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{m.code}</td>
                    <td className="px-4 py-2.5 text-gray-900">{m.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{m.spec || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        m.status === 'active'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {m.status === 'active' ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => onMigrate(m)}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="迁移到其他分类"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        迁移
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {materialTotal > materials.length && (
              <div className="px-4 py-2.5 border-t border-gray-200 text-center">
                <button
                  onClick={onLoadMore}
                  disabled={materialsLoading}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                >
                  {materialsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  还有 {materialTotal - materials.length} 个物料，点击加载更多
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
