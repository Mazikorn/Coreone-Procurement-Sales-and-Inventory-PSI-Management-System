import request from './request'

export const usersApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    role?: string
    status?: string
    roleId?: string
  }) => request.get('/users', { params }),

  create: (data: {
    username: string
    realName?: string
    role: string
    department?: string
    phone?: string
    email?: string
    status?: 'active' | 'inactive'
  }) => request.post('/users', data),

  update: (id: string, data: {
    username?: string
    realName?: string
    role?: string
    department?: string
    phone?: string
    email?: string
    status?: 'active' | 'inactive'
  }) => request.put(`/users/${id}`, data),

  delete: (id: string) =>
    request.delete(`/users/${id}`),

  resetPassword: (id: string) =>
    request.post(`/users/${id}/reset-password`),
}
