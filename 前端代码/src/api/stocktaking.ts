import request from './request'

export const stocktakingApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    status?: string
  }) => request.get('/stocktaking', { params }),

  getStats: (params?: {
    keyword?: string
    status?: string
  }) => request.get('/stocktaking/stats', { params }),

  create: (data: {
    materialId: string
    systemStock: number
    actualStock: number
    remark?: string
  }) => request.post('/stocktaking', data),

  delete: (id: string) =>
    request.delete(`/stocktaking/${id}`),

  confirm: (id: string, data: {
    reason: string
    remark?: string
  }) => request.post(`/stocktaking/${id}/confirm`, data),
}
