import request from './request'

export const rolesApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
  }) => request.get('/roles', { params }),

  create: (data: {
    code: string
    name: string
    description?: string
    permissions?: string[]
    status?: 'active' | 'inactive'
    dataScope?: 'all' | 'dept' | 'self'
  }) => request.post('/roles', data),

  update: (id: string, data: {
    code?: string
    name?: string
    description?: string
    permissions?: string[]
    status?: 'active' | 'inactive'
    dataScope?: 'all' | 'dept' | 'self'
  }) => request.put(`/roles/${id}`, data),

  delete: (id: string) =>
    request.delete(`/roles/${id}`),
}
