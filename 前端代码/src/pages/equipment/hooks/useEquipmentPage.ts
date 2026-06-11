import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { equipmentApi } from '@/api/master'
import type { Equipment, EquipmentType } from '@/types'
import { toast } from 'sonner'

export interface EquipmentForm {
  code: string
  name: string
  model: string
  manufacturer: string
  purchasePrice: number
  purchaseDate: string
  depreciableLifeYears: number
  residualValue: number
  depreciationMethod: 'straight_line' | 'units_of_production'
  totalCapacity: number
  capacityUnit: string
  status: 'active' | 'inactive' | 'scrapped'
  locationId: string
  typeId: string
}

export function useEquipmentPage() {
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTypeId, setFilterTypeId] = useState('')
  const [typeOptions, setTypeOptions] = useState<Array<{ value: string; label: string }>>([])

  const [modalType, setModalType] = useState<null | 'create' | 'edit' | 'detail' | 'delete'>('null' as any)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<Equipment | null>(null)

  const [form, setForm] = useState<EquipmentForm>({
    code: '',
    name: '',
    model: '',
    manufacturer: '',
    purchasePrice: 0,
    purchaseDate: '',
    depreciableLifeYears: 5,
    residualValue: 0,
    depreciationMethod: 'straight_line',
    totalCapacity: 0,
    capacityUnit: '',
    status: 'active',
    locationId: '',
    typeId: '',
  })

  // 加载设备类型选项
  useEffect(() => {
    equipmentApi.getTypes({ pageSize: 100 }).then((res: any) => {
      const options = (res?.list || []).map((t: EquipmentType) => ({ value: t.id, label: t.name }))
      setTypeOptions(options)
    }).catch(() => {})
  }, [])

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res: any = await equipmentApi.getList({
        ...params,
        keyword: keyword || undefined,
        status: filterStatus || undefined,
        typeId: filterTypeId || undefined,
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, filterStatus, filterTypeId]
  )

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } =
    usePagination<Equipment>({ fetchFn, initialPage: 1, initialPageSize: 20, deps: [keyword, filterStatus, filterTypeId] })

  const stats = useMemo(() => {
    const all = data
    const active = all.filter((e) => e.status === 'active').length
    const inactive = all.filter((e) => e.status === 'inactive').length
    const scrapped = all.filter((e) => e.status === 'scrapped').length
    const totalValue = all.reduce((sum, e) => sum + (e.purchasePrice || 0), 0)
    return { total: all.length, active, inactive, scrapped, totalValue }
  }, [data])

  const handleSearch = () => {
    setKeyword(searchInput)
    setPage(1)
  }

  const handleReset = () => {
    setSearchInput('')
    setKeyword('')
    setFilterStatus('')
    setFilterTypeId('')
    setPage(1)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      code: '',
      name: '',
      model: '',
      manufacturer: '',
      purchasePrice: 0,
      purchaseDate: '',
      depreciableLifeYears: 5,
      residualValue: 0,
      depreciationMethod: 'straight_line',
      totalCapacity: 0,
      capacityUnit: '',
      status: 'active',
      locationId: '',
      typeId: '',
    })
    setModalType('create')
  }

  const openEdit = (row: Equipment) => {
    setEditingId(row.id)
    setForm({
      code: row.code || '',
      name: row.name || '',
      model: row.model || '',
      manufacturer: row.manufacturer || '',
      purchasePrice: row.purchasePrice || 0,
      purchaseDate: row.purchaseDate || '',
      depreciableLifeYears: row.depreciableLifeYears || 5,
      residualValue: row.residualValue || 0,
      depreciationMethod: row.depreciationMethod || 'straight_line',
      totalCapacity: row.totalCapacity || 0,
      capacityUnit: row.capacityUnit || '',
      status: row.status || 'active',
      locationId: row.locationId || '',
      typeId: row.typeId || '',
    })
    setModalType('edit')
  }

  const openDetail = (row: Equipment) => {
    setDetailRow(row)
    setModalType('detail')
  }

  const openDelete = (row: Equipment) => {
    setEditingId(row.id)
    setDetailRow(row)
    setModalType('delete')
  }

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填项')
      return
    }
    try {
      const payload = { ...form }
      if (editingId) {
        await equipmentApi.update(editingId, payload)
        toast.success('设备更新成功')
      } else {
        await equipmentApi.create(payload)
        toast.success('设备创建成功')
      }
      setModalType(null)
      refresh()
    } catch {
      toast.error('操作失败')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    try {
      await equipmentApi.delete(editingId)
      toast.success('设备已删除')
      setModalType(null)
      setEditingId(null)
      refresh()
    } catch {
      toast.error('删除失败')
    }
  }

  return {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
    stats,
    keyword,
    searchInput,
    setSearchInput,
    filterStatus,
    setFilterStatus,
    filterTypeId,
    setFilterTypeId,
    typeOptions,
    modalType,
    setModalType,
    editingId,
    detailRow,
    form,
    setForm,
    handleSearch,
    handleReset,
    openCreate,
    openEdit,
    openDetail,
    openDelete,
    handleSubmit,
    handleDelete,
  }
}
