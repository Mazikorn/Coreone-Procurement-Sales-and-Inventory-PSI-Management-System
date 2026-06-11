import request from './request'

export const abcApi = {
  // ===== 作业中心管理 =====
  getActivityCenters: () =>
    request.get('/abc/activity-centers'),

  getActivityCenter: (id: string) =>
    request.get(`/abc/activity-centers/${id}`),

  createActivityCenter: (data: any) =>
    request.post('/abc/activity-centers', data),

  updateActivityCenter: (id: string, data: any) =>
    request.put(`/abc/activity-centers/${id}`, data),

  deleteActivityCenter: (id: string) =>
    request.delete(`/abc/activity-centers/${id}`),

  // ===== 成本动因 =====
  getCostDrivers: () =>
    request.get('/abc/cost-drivers'),

  createCostDriver: (data: any) =>
    request.post('/abc/cost-drivers', data),

  // ===== 成本池 =====
  getCostPools: (params?: any) =>
    request.get('/abc/cost-pools', { params }),

  createCostPool: (data: any) =>
    request.post('/abc/cost-pools', data),

  syncCostPools: (yearMonth: string) =>
    request.post('/abc/cost-pools/sync', { yearMonth }),

  autoCollectCostPools: (yearMonth: string) =>
    request.post('/abc/cost-pools/auto-collect', { yearMonth }),

  recalculateCostPools: (yearMonth: string) =>
    request.post('/abc/cost-pools/recalculate', { yearMonth }),

  // ===== BOM 作业关联 =====
  getBomLinks: (bomId: string) =>
    request.get(`/abc/bom-links/${bomId}`),

  updateBomLinks: (bomId: string, links: any[]) =>
    request.put(`/abc/bom-links/${bomId}`, { links }),

  // ===== 收费标准 =====
  getFeeStandards: (params?: any) =>
    request.get('/abc/fee-standards', { params }),

  getFeeStandard: (id: string) =>
    request.get(`/abc/fee-standards/${id}`),

  // ===== 盈利性分析 =====
  getProfitability: (params?: any) =>
    request.get('/abc/profitability', { params }),

  // ===== 成本看板 =====
  getDashboard: (month?: string) =>
    request.get('/abc/dashboard', { params: { month } }),

  // ===== 收费对照 =====
  getFeeComparison: (params?: any) =>
    request.get('/abc/fee-comparison', { params }),

  // ===== 成本趋势 =====
  getSlideCostTrend: (params?: any) =>
    request.get('/abc/slide-cost-trend', { params }),

  // ===== 导出 =====
  exportData: (params: any) =>
    request.get('/abc/export', { params }),

  // ===== 批次追溯 =====
  getBatchTrace: (batchId: string) =>
    request.get(`/abc/batch-trace/${batchId}`),

  // ===== 预算管理 =====
  getBudgets: (params?: any) =>
    request.get('/abc/budgets', { params }),

  createBudget: (data: any) =>
    request.post('/abc/budgets', data),

  // ===== 质量成本 =====
  getQualityCosts: (params?: any) =>
    request.get('/abc/quality-costs', { params }),

  createQualityCost: (data: any) =>
    request.post('/abc/quality-costs', data),

  getQualityCostSummary: (yearMonth?: string) =>
    request.get('/abc/quality-costs/summary', { params: { yearMonth } }),

  // ===== 审计日志 =====
  getAuditLogs: (params?: any) =>
    request.get('/abc/audit-logs', { params }),

  // ===== 预警规则 =====
  getAlertRules: () =>
    request.get('/abc/alert-rules'),

  createAlertRule: (data: any) =>
    request.post('/abc/alert-rules', data),

  // ===== 差异分析 =====
  getVarianceAnalysis: (params?: any) =>
    request.get('/abc/variance-analysis', { params }),
}
