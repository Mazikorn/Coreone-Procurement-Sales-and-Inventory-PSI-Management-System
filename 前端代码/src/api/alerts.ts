import request from './request'

export const alertsApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'low-stock' | 'expiry' | 'stagnant'
    status?: 'pending' | 'processed' | 'ignored' | 'processed,auto_resolved,handled' | 'ignored,dismissed' | 'processed,ignored,auto_resolved,dismissed,handled'
    startDate?: string
    endDate?: string
  }) => request.get('/alerts', { params }),

  getStats: (params?: {
    keyword?: string
    type?: 'low-stock' | 'expiry' | 'stagnant'
    status?: 'pending' | 'processed' | 'ignored' | 'processed,auto_resolved,handled' | 'ignored,dismissed' | 'processed,ignored,auto_resolved,dismissed,handled'
    startDate?: string
    endDate?: string
  }) => request.get('/alerts/stats', { params }),

  process: (id: string, data?: { remark?: string }) =>
    request.post(`/alerts/${id}/process`, data || {}),

  ignore: (id: string, data?: { remark?: string }) =>
    request.post(`/alerts/${id}/ignore`, data || {}),

  batchHandle: (ids: string[], data?: { action?: 'processed' | 'ignored'; remark?: string }) =>
    request.post('/alerts/batch/handle', { ids, action: data?.action || 'processed', remark: data?.remark }),
}
