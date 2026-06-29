import request from './request'
import type { ConfigEnvelope, ConfigChange, PartnerConfig } from '@/types/partner-config'

export interface PartnerListItem {
  id: string
  code: string
  name: string
  shortName?: string
  serviceScope?: string
  status?: string
}

// request 拦截器已解包 → 直接返回 data 层
export const partnerConfigApi = {
  /** 合作医院列表（配置页左侧选院）。successList → {list} */
  partners: (params?: { keyword?: string; page?: number; pageSize?: number }) =>
    request.get('/partners', { params: { pageSize: 100, ...params } }) as unknown as Promise<{ list: PartnerListItem[]; total: number }>,

  /** GET /partner-config/:id —— 取配置（首访默认 seed） */
  get: (partnerId: string) =>
    request.get(`/partner-config/${partnerId}`) as unknown as Promise<ConfigEnvelope>,

  /** PUT /partner-config/:id —— 保存（生成版本+变更；乐观锁 expectedVersion） */
  save: (partnerId: string, body: { config: PartnerConfig; expectedVersion?: number; tab?: string }) =>
    request.put(`/partner-config/${partnerId}`, body) as unknown as Promise<{ partnerId: string; version: number; diffs: { path: string; label: string; before: unknown; after: unknown }[] }>,

  /** GET /partner-config/:id/changes —— 变更记录 */
  changes: (partnerId: string) =>
    request.get(`/partner-config/${partnerId}/changes`) as unknown as Promise<ConfigChange[]>,

  /** POST /partner-config/:id/rollback —— 回滚到某版本（生成新版本） */
  rollback: (partnerId: string, toVersion: number) =>
    request.post(`/partner-config/${partnerId}/rollback`, { toVersion }) as unknown as Promise<{ partnerId: string; version: number }>,

  /** POST /partner-config/:id/baseline —— 设某版本为月度导入基线 */
  baseline: (partnerId: string, version: number) =>
    request.post(`/partner-config/${partnerId}/baseline`, { version }) as unknown as Promise<{ partnerId: string; baselineVersion: number }>,
}
