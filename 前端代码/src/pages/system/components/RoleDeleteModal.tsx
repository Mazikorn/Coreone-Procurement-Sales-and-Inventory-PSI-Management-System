import { X, Shield } from 'lucide-react'
import type { Role } from '@/types'

interface Props {
  open: boolean
  role: Role | null
  onClose: () => void
  onConfirm: () => void
}

export function RoleDeleteModal({ open, role, onClose, onConfirm }: Props) {
  if (!open || !role) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <Shield className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">确定要删除该角色吗？</h3>
          <p className="text-sm text-gray-500 mb-4">删除后，该角色下的用户将失去对应权限</p>
          <div className="bg-gray-50 rounded-lg p-3 text-left">
            <div className="text-xs text-gray-500 mb-1">待删除角色</div>
            <div className="font-semibold text-gray-900">{role.name}</div>
            <div className="text-xs text-gray-500 mt-1">当前用户数: {(role as any).userCount || 0} 人</div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all">取消</button>
          <button onClick={onConfirm} className="h-10 px-4 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 shadow-sm transition-all">确认删除</button>
        </div>
      </div>
    </div>
  )
}
