import request from './request'

export const reconciliationApi = {
  getSummary(params: { startDate: string; endDate: string }) {
    return request.get('/reconciliation/summary', { params })
  },

  getProjects(params: { startDate: string; endDate: string }) {
    return request.get('/reconciliation/projects', { params })
  },

  getMaterials(params: { startDate: string; endDate: string }) {
    return request.get('/reconciliation/materials', { params })
  },

  getCases(params: { page: number; pageSize: number; search?: string; projectId?: string; status?: string }) {
    return request.get('/reconciliation/cases', { params })
  },

  getLogs(params: { page: number; pageSize: number }) {
    return request.get('/reconciliation/logs', { params })
  },

  getProjectMaterials(projectId: string, params: { startDate: string; endDate: string }) {
    return request.get(`/reconciliation/projects/${projectId}/materials`, { params })
  },

  importCases(data: { items: Array<{ caseNo: string; projectName: string; operateTime: string; operator: string }> }) {
    return request.post('/reconciliation/cases/import', data)
  },

  createLog(data: {
    type: string
    targetId: string
    targetName: string
    field: string
    oldValue: string
    newValue: string
    reason: string
    projectId?: string
    materialId?: string
    newUsage?: number
  }) {
    return request.post('/reconciliation/logs', data)
  },

  updateCase(id: string, data: { projectId?: string; status?: string }) {
    return request.put(`/reconciliation/cases/${id}`, data)
  },
}
