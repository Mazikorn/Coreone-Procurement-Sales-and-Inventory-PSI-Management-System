import request from './request'

export const logsApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import'
    module?: 'inventory' | 'inbound' | 'outbound' | 'user' | 'system'
    username?: string
    startDate?: string
    endDate?: string
  }) => request.get('/logs', { params }),

  export: (params: {
    startDate: string
    endDate: string
    format?: 'xlsx' | 'csv'
  }) => request.get('/logs/export', { params, responseType: 'blob' }),
}
