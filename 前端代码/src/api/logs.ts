import request from './request'

export const logsApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import'
    module?: string
    username?: string
    startDate?: string
    endDate?: string
  }) => request.get('/logs', { params }),

  getStats: () => request.get('/logs/stats'),

  export: (params: {
    startDate?: string
    endDate?: string
    format?: 'csv'
    keyword?: string
    type?: string
    module?: string
    username?: string
    includeBasic?: boolean
    includeDetail?: boolean
    includeIP?: boolean
    includeDiff?: boolean
  }) => request.post('/logs/export', params, { responseType: 'blob' }),

  clean: (beforeDate: string) =>
    request.delete<{ deletedCount: number; beforeDate: string }>('/logs', { params: { beforeDate } }),
}
