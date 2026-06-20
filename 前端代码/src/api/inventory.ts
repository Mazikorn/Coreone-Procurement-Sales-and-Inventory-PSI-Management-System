import request from './request'
import type { PaginationData, InventoryItem, InventoryStats, InventoryConsistencyCheck, InboundRecord, InboundFormData, OutboundRecord, OutboundFormData, PageParams, SupplierReturnRecord, SupplierReturnFormData, ReturnRecord, ReturnSource } from '@/types'

export const inventoryApi = {
  getList: (params?: PageParams & { status?: string; categoryId?: string; locationId?: string; keyword?: string; materialId?: string }) =>
    request.get<PaginationData<InventoryItem>>('/inventory', { params }),

  getStats: (params?: { keyword?: string; categoryId?: string; locationId?: string; materialId?: string }) =>
    request.get<InventoryStats>('/inventory/stats', { params }),

  getConsistencyCheck: () =>
    request.get<InventoryConsistencyCheck>('/inventory/consistency-check'),
}

export const inboundApi = {
  getList: (params?: PageParams & { status?: string; type?: string; materialId?: string; keyword?: string; startDate?: string; endDate?: string }) =>
    request.get<PaginationData<InboundRecord>>('/inbound', { params }),

  create: (data: InboundFormData) =>
    request.post<InboundRecord>('/inbound', data),

  batchCreate: (records: InboundFormData[]) =>
    request.post<{ createdCount: number; ids: string[] }>('/inbound/batch', { records }),

  update: (id: string, data: Partial<InboundFormData>) =>
    request.put<InboundRecord>(`/inbound/${id}`, data),

  delete: (id: string) =>
    request.delete(`/inbound/${id}`),

  getStats: () =>
    request.get<{
      total: number
      monthTotal: number
      completed: number
      cancelled: number
      amount: number
      supplierCount: number
      pendingOrders: number
      quickCounts: { all: number; today: number; week: number; month: number }
    }>('/inbound/stats'),

  checkDeletable: (id: string) =>
    request.get<{ canDelete: boolean; reasons: string[]; record: any }>(`/inbound/${id}/check-deletable`),

  cancel: (id: string, reason: string) =>
    request.post(`/inbound/${id}/cancel`, { reason }),

  createTransfer: (data: { materialId: string; quantity: number; fromLocationId: string; toLocationId: string; batchNo?: string; operator?: string; remark?: string; fromLocationName?: string }) =>
    request.post('/transfers/inbound', data),
}

export const purchaseOrderApi = {
  getList: (params?: { status?: string; supplierId?: string; keyword?: string; page?: number; pageSize?: number }) =>
    request.get<PaginationData<Record<string, unknown>>>('/purchase-orders', { params }),
  getById: (id: string) =>
    request.get<Record<string, unknown>>(`/purchase-orders/${id}`),
  create: (data: Record<string, unknown>) =>
    request.post<Record<string, unknown>>('/purchase-orders', data),
  receive: (id: string, data: { quantity: number }) =>
    request.put<Record<string, unknown>>(`/purchase-orders/${id}/receive`, data),
  cancel: (id: string) =>
    request.put(`/purchase-orders/${id}/cancel`),
}

export const outboundApi = {
  getList: (params?: PageParams & { projectId?: string; status?: string; keyword?: string; materialId?: string; type?: string; startDate?: string; endDate?: string }) =>
    request.get<PaginationData<OutboundRecord>>('/outbound', { params }),

  getStats: () =>
    request.get<{
      total: number
      monthTotal: number
      completed: number
      pending: number
      cancelled: number
      totalCost: number
      quickCounts: { all: number; today: number; week: number; month: number }
    }>('/outbound/stats'),

  create: (data: OutboundFormData) =>
    request.post<OutboundRecord>('/outbound', data),

  createBom: (data: { bomId?: string; projectId?: string; sampleCount: number; caseNo?: string; remark?: string }) =>
    request.post<OutboundRecord>('/outbound/bom', data),

  update: (id: string, data: Partial<OutboundFormData>) =>
    request.put<OutboundRecord>(`/outbound/${id}`, data),

  delete: (id: string, data?: { reason?: string; remark?: string }) =>
    request.delete(`/outbound/${id}`, { data }),
}

export const scrapApi = {
  getList: (params?: PageParams) =>
    request.get<PaginationData<Record<string, unknown>>>('/scraps', { params }),
  create: (data: { materialId: string; batchId?: string; quantity: number; reason: string; operator?: string; remark?: string }) =>
    request.post<Record<string, unknown>>('/scraps', data),
  batchCreate: (records: Array<{ materialId: string; batchId?: string; quantity: number; reason: string; remark?: string }>) =>
    request.post<{ createdCount: number; ids: string[] }>('/scraps/batch', { records }),
  delete: (id: string) =>
    request.delete(`/scraps/${id}`),
}

export const returnApi = {
  getList: (params?: PageParams & { keyword?: string }) =>
    request.get<PaginationData<ReturnRecord>>('/returns', { params }),
  getSources: (params?: PageParams & { keyword?: string; materialId?: string }) =>
    request.get<PaginationData<ReturnSource>>('/returns/sources', { params }),
  create: (data: { outboundItemId: string; quantity: number; reason: string; remark?: string }) =>
    request.post<{ id: string }>('/returns', data),
  delete: (id: string) =>
    request.delete(`/returns/${id}`),
}

export const supplierReturnApi = {
  getList: (params?: PageParams & { supplierId?: string; status?: string; keyword?: string; startDate?: string; endDate?: string }) =>
    request.get<PaginationData<SupplierReturnRecord>>('/supplier-returns', { params }),
  getById: (id: string) =>
    request.get<SupplierReturnRecord>(`/supplier-returns/${id}`),
  create: (data: SupplierReturnFormData) =>
    request.post<SupplierReturnRecord>('/supplier-returns', data),
  updateStatus: (id: string, status: string) =>
    request.put<SupplierReturnRecord>(`/supplier-returns/${id}/status`, { status }),
  delete: (id: string) =>
    request.delete(`/supplier-returns/${id}`),
}

export const transferApi = {
  getList: (params?: PageParams) =>
    request.get<PaginationData<Record<string, unknown>>>('/transfers', { params }),
  createInbound: (data: { materialId: string; batchNo?: string; quantity: number; fromLocationId?: string; fromLocationName?: string; toLocationId: string; operator?: string; remark?: string }) =>
    request.post<Record<string, unknown>>('/transfers/inbound', data),
  delete: (id: string) =>
    request.delete(`/transfers/${id}`),
}

export const depletionApi = {
  getTracking: (params?: { status?: string }) =>
    request.get<{ list: Record<string, unknown>[] }>('/depletion/tracking', { params }),
  getDepletion: () =>
    request.get<{ list: Record<string, unknown>[] }>('/depletion/depletion'),
  updateRemain: (id: string, data: { remaining: number; reason?: string }) =>
    request.put<{ id: string; remaining: number }>(`/depletion/tracking/${id}/remain`, data),
  deplete: (id: string, data: { remain_qty: number; deplete_type: string; deplete_reason?: string }) =>
    request.post<{ id: string }>(`/depletion/tracking/${id}/deplete`, data),
}
