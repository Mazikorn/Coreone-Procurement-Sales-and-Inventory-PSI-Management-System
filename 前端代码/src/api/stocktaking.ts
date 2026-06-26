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
    locationId?: string
    batchId?: string
    systemStock: number
    actualStock: number
    remark?: string
  }) => request.post('/stocktaking', data),

  // P1-04：批量盘点——一次提交多物料行，共享盘点单号
  createBatch: (data: {
    items: Array<{ materialId: string; actualStock: number; locationId?: string; batchId?: string; remark?: string }>
  }) => request.post('/stocktaking/batch', data),

  delete: (id: string) =>
    request.delete(`/stocktaking/${id}`),

  confirm: (id: string, data: {
    reason: string
    remark?: string
  }) => request.post(`/stocktaking/${id}/confirm`, data),
}
