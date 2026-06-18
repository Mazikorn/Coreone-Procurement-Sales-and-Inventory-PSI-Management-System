import { useState, useEffect, useCallback, useRef } from 'react'
import type { DependencyList } from 'react'

export interface UsePaginationOptions<T> {
  fetchFn: (params: { page: number; pageSize: number }) => Promise<{
    list: T[]
    pagination?: { total: number; page: number; pageSize: number }
  }>
  initialPage?: number
  initialPageSize?: number
  deps?: DependencyList
}

export interface UsePaginationReturn<T> {
  data: T[]
  loading: boolean
  error: string | null
  page: number
  pageSize: number
  total: number
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  refresh: () => void
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: unknown
      response?: { data?: { error?: { message?: unknown } } }
    }
    const responseMessage = maybeError.response?.data?.error?.message
    if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage
    if (typeof maybeError.message === 'string' && maybeError.message.trim()) return maybeError.message
  }
  return '加载失败'
}

export function usePagination<T>({
  fetchFn,
  initialPage = 1,
  initialPageSize = 20,
  deps = [],
}: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [total, setTotal] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const fetchFnRef = useRef(fetchFn)

  useEffect(() => {
    fetchFnRef.current = fetchFn
  }, [fetchFn])

  const fetchData = useCallback(
    async () => {
      setLoading(true)
      try {
        const res = await fetchFnRef.current({
          page,
          pageSize,
        })
        setData(res.list || [])
        setTotal(res.pagination?.total || 0)
        setError(null)
      } catch (e) {
        setData([])
        setTotal(0)
        setError(getErrorMessage(e))
      } finally {
        setLoading(false)
      }
    },
    [page, pageSize, refreshKey, ...deps]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const goToPage = useCallback(
    (p: number) => {
      setPage(p)
    },
    []
  )

  const changePageSize = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  return {
    data,
    loading,
    error,
    page,
    pageSize,
    total,
    setPage: goToPage,
    setPageSize: changePageSize,
    refresh: () => setRefreshKey(key => key + 1),
  }
}
