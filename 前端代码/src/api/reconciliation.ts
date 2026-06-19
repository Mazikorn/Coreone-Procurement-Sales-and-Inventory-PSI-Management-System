import request from './request'

export const reconciliationApi = {
  getSummary: (params?: any) =>
    request.get('/reconciliation/summary', { params }),

  getProjects: (params?: any) =>
    request.get('/reconciliation/projects', { params }),

  getProjectMaterials: (projectId: string, params?: any) =>
    request.get(`/reconciliation/projects/${projectId}/materials`, { params }),

  auditProjectMaterials: (projectId: string, data?: any) =>
    request.post(`/reconciliation/projects/${projectId}/materials/audit`, data || {}),

  exportData: (params?: any) =>
    request.post('/reconciliation/export', params || {}, { responseType: 'blob' }),

  getMaterials: (params?: any) =>
    request.get('/reconciliation/materials', { params }),

  getCases: (params?: any) =>
    request.get('/reconciliation/cases', { params }),

  importCases: (data: any) =>
    request.post('/reconciliation/cases/import', data),

  updateCase: (id: string, data: any) =>
    request.put(`/reconciliation/cases/${id}`, data),

  getLogs: (params?: any) =>
    request.get('/reconciliation/logs', { params }),

  createLog: (data: any) =>
    request.post('/reconciliation/logs', data),
}
