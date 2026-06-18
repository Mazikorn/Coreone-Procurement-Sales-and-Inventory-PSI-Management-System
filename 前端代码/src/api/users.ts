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

  getStats: (params?: {
    keyword?: string
    role?: string
    status?: string
    roleId?: string
  }) => request.get('/users/stats', { params }),

  create: (data: {
    username: string
    password?: string
    realName?: string
    role: string
    department?: string
    phone?: string
    email?: string
    status?: 'active' | 'inactive'
  }) => request.post<{ id: string; initialPassword?: string }>('/users', data),

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

  batchUpdateStatus: (ids: string[], status: 'active' | 'inactive') =>
    request.put<{ updatedCount: number }>('/users/batch/status', { ids, status }),

  batchDelete: (ids: string[]) =>
    request.delete<{ deletedCount: number }>('/users/batch', { data: { ids } }),

  resetPassword: (id: string) =>
    request.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`),
}
