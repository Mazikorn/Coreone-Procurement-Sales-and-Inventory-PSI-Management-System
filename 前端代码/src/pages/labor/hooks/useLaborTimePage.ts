import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { laborTimeApi } from '@/api/master'
import type { StandardLaborTime } from '@/types'

export interface LaborTimeRow {
  id: string
  stepCode: string
  stepName: string
  projectType: string
  standardMinutes: number
  laborRatePerMinute: number
  isEquipmentStep: boolean
  referenceSource: string
  referenceSourceLabel?: string
  status: string
  createdAt: string
}

export interface LaborTimeForm {
  stepCode: string
  stepName: string
  projectType: string
  standardMinutes: number
  laborRatePerMinute: number
  isEquipmentStep: boolean
  referenceSource: string
}

const defaultForm: LaborTimeForm = {
  stepCode: '',
  stepName: '',
  projectType: 'all',
  standardMinutes: 0,
  laborRatePerMinute: 0,
  isEquipmentStep: false,
  referenceSource: 'system',
}

export const PROJECT_TYPE_OPTIONS = [
  { value: '', label: '全部项目类型' },
  { value: 'all', label: '全部' },
  { value: 'ihc', label: 'IHC' },
  { value: 'fish', label: 'FISH' },
  { value: 'special', label: '特染' },
]

export function useLaborTimePage() {
  const url = useUrlParams()
  const [searchInput, setSearchInput] = useState(url.get('keyword', ''))
  const [keyword, setKeyword] = useState(url.get('keyword', ''))
  const [filterProjectType, setFilterProjectType] = useState(url.get('projectType', ''))
  const [filterReferenceSource, setFilterReferenceSource] = useState(url.get('referenceSource', ''))
  const [modalType, setModalType] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [form, setForm] = useState<LaborTimeForm>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<LaborTimeRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const response: any = await laborTimeApi.getList({
        page: params.page,
        pageSize: params.pageSize,
        keyword: keyword || undefined,
        projectType: filterProjectType || undefined,
        referenceSource: filterReferenceSource || undefined,
      })
      const payload = response?.data ?? response
      return {
        list: payload?.list || [],
        pagination: payload?.pagination || { total: 0, page: params.page, pageSize: params.pageSize },
      }
    },
    [keyword, filterProjectType, filterReferenceSource]
  )

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } = usePagination<LaborTimeRow>({
    fetchFn,
    initialPage: Math.max(1, url.getNumber('page', 1)),
    initialPageSize: 20,
    deps: [keyword, filterProjectType, filterReferenceSource],
  })

  const stats = useMemo(() => ({
    total: data.length,
    totalMinutes: data.reduce((s, r) => s + r.standardMinutes, 0),
    avgRate: data.length ? data.reduce((s, r) => s + r.laborRatePerMinute, 0) / data.length : 0,
    equipmentSteps: data.filter(r => r.isEquipmentStep).length,
  }), [data])

  const handleSearch = () => { setKeyword(searchInput); setPage(1) }
  const handleReset = () => { setSearchInput(''); setKeyword(''); setFilterProjectType(''); setFilterReferenceSource(''); setPage(1) }

  const openCreate = () => { setForm(defaultForm); setEditingId(null); setModalType('create') }
  const openEdit = (row: LaborTimeRow) => {
    setDetailRow(row)
    setForm({
      stepCode: row.stepCode, stepName: row.stepName, projectType: row.projectType,
      standardMinutes: row.standardMinutes, laborRatePerMinute: row.laborRatePerMinute,
      isEquipmentStep: row.isEquipmentStep, referenceSource: row.referenceSource,
    })
    setEditingId(row.id)
    setModalType('edit')
  }
  const openDelete = (row: LaborTimeRow) => { setDetailRow(row); setModalType('delete') }

  const handleSubmit = async () => {
    if (!form.stepCode || !form.stepName) {
      toast.error('请填写步骤编号和名称')
      return
    }
    setSubmitting(true)
    try {
      if (modalType === 'edit' && editingId) {
        await laborTimeApi.update(editingId, form as Partial<StandardLaborTime>)
        toast.success('修改成功')
      } else {
        await laborTimeApi.create(form as Partial<StandardLaborTime>)
        toast.success('创建成功')
      }
      setModalType(null)
      refresh()
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!detailRow) return
    setSubmitting(true)
    try {
      await laborTimeApi.delete(detailRow.id)
      toast.success('删除成功')
      setModalType(null)
      refresh()
    } catch (error: any) {
      toast.error(error?.message || '删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    searchInput, setSearchInput,
    handleSearch, handleReset,
    filterProjectType, setFilterProjectType,
    filterReferenceSource, setFilterReferenceSource,
    PROJECT_TYPE_OPTIONS,
    data, loading, page, pageSize, total, setPage, setPageSize,
    stats,
    modalType, setModalType,
    form, setForm,
    handleSubmit,
    submitting,
    openCreate, openEdit, openDelete,
    detailRow,
    handleDelete,
  }
}
