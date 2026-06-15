import request from './request'

export const stocktakingApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
  }) => request.get('/stocktaking', { params }),

  create: (data: {
    materialId: string
    systemStock: number
    actualStock: number
    remark?: string
  }) => request.post('/stocktaking', data),

  delete: (id: string) =>
    request.delete(`/stocktaking/${id}`),
}
