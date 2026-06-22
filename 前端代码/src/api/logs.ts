import request from './request'

export interface LogArchiveCredential {
  id: string
  archiveNo: string
  sourceType: string
  beforeDate: string
  retentionDays: number
  rowCount: number
  contentHash: string
  previousChainHash?: string | null
  chainHash: string
  protectedFactCounts?: {
    stock?: number
    batchLocation?: number
    abc?: number
    reconciliation?: number
  }
  externalArchive?: {
    status: 'exported' | 'not_configured'
    storageType?: string
    uri?: string | null
    packageHash?: string | null
    packageHashAlgorithm?: 'SHA-256'
    exportedAt?: string
    storageGovernance?: {
      status: 'declared' | 'not_configured' | 'invalid_configuration' | 'insufficient_retention'
      mode?: 'retention_lock' | 'worm' | null
      retentionUntil?: string | null
      requiredRetentionUntil?: string | null
      evidenceUri?: string | null
      enforcement?: 'external_storage'
      missingReason?: string
      warning?: string
    }
  }
  createdBy?: string
  createdAt: string
}

export interface LogArchiveChainVerification {
  valid: boolean
  checkedCount: number
  latestArchiveNo?: string | null
  latestChainHash?: string | null
  brokenArchiveNo?: string | null
  brokenReason?: string | null
}

export interface LogArchiveReportSignature {
  status: 'signed' | 'unsigned'
  algorithm: 'HMAC-SHA256'
  keyId: string
  signedPayload: 'reportHash'
  missingReason?: string
  keyGovernance?: {
    status: 'active' | 'rotation_due' | 'not_configured' | 'invalid_configuration'
    keyCreatedAt?: string | null
    rotationDays?: number | null
    rotationDueAt?: string | null
    missingReason?: string
  }
}

export const logsApi = {
  getList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import'
    module?: string
    username?: string
    startDate?: string
    endDate?: string
  }) => request.get('/logs', { params }),

  getUnifiedList: (params?: {
    page?: number
    pageSize?: number
    keyword?: string
    type?: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import'
    module?: string
    username?: string
    sourceType?: 'all' | 'operation' | 'stock' | 'batch_location' | 'abc' | 'reconciliation'
    startDate?: string
    endDate?: string
  }) => request.get('/logs/unified', { params }),

  getStats: () => request.get('/logs/stats'),

  getArchives: (params?: { page?: number; pageSize?: number }) =>
    request.get<{
      list: LogArchiveCredential[]
      pagination: { page: number; pageSize: number; total: number; totalPages: number }
      reportSignature?: LogArchiveReportSignature
    }>('/logs/archives', { params }),

  verifyArchiveChain: () =>
    request.post<LogArchiveChainVerification>('/logs/archives/verify', {}),

  exportArchiveVerificationReport: () =>
    request.get('/logs/archives/verification-report', { responseType: 'blob' }),

  export: (params: {
    startDate?: string
    endDate?: string
    format?: 'csv'
    keyword?: string
    type?: string
    module?: string
    username?: string
    sourceType?: 'all' | 'operation' | 'stock' | 'batch_location' | 'abc' | 'reconciliation'
    includeBasic?: boolean
    includeDetail?: boolean
    includeIP?: boolean
    includeDiff?: boolean
  }) => request.post('/logs/export', params, { responseType: 'blob' }),

  clean: (beforeDate: string) =>
    request.delete<{
      deletedCount: number
      beforeDate: string
      archiveId?: string
      archiveNo?: string
      archiveHash?: string
      archiveChainHash?: string
      previousArchiveChainHash?: string | null
      protectedFactCounts?: {
        stock?: number
        batchLocation?: number
        abc?: number
        reconciliation?: number
      }
    }>('/logs', { params: { beforeDate } }),
}
