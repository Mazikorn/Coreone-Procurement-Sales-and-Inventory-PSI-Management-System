import request from './request'

export const alertsApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'low-stock' | 'expiry' | 'stagnant'
    status?: 'pending' | 'processed' | 'ignored'
    startDate?: string
    endDate?: string
  }) => request.get('/alerts', { params }),

  process: (id: string) =>
    request.post(`/alerts/${id}/process`),

  ignore: (id: string) =>
    request.post(`/alerts/${id}/ignore`),
}
