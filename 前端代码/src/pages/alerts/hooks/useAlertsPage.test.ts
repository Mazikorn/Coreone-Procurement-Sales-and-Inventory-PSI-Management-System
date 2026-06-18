import { describe, expect, it } from 'vitest'
import { buildAlertHandleRemark } from './useAlertsPage'

describe('buildAlertHandleRemark', () => {
  it('records the selected handling conclusion and opinion', () => {
    expect(buildAlertHandleRemark({
      result: 'purchase_followed',
      opinion: '已通知采购补货',
    })).toBe('处理结论：采购跟进中\n处理意见：已通知采购补货')
  })

  it('does not claim inventory was adjusted by the alert handler', () => {
    expect(buildAlertHandleRemark({
      result: 'adjusted',
      opinion: '库存已修正',
    })).toBe('处理结论：其他处理\n处理意见：库存已修正')
  })
})
