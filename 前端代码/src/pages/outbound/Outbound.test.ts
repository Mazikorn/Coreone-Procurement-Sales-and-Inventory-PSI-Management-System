import { describe, expect, it } from 'vitest'
import { mapOutboundRecordToForm } from './Outbound'
import type { OutboundRecord } from '@/types'

describe('mapOutboundRecordToForm', () => {
  it('preserves selected batch when editing an outbound record', () => {
    const record: OutboundRecord = {
      id: 'out-1',
      outboundNo: 'OB-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      caseNo: 'CASE-001',
      items: [
        {
          id: 'item-1',
          outboundId: 'out-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-late',
          batchNo: 'BATCH-LATE',
          quantity: 3,
          unit: 'ml',
          unitCost: 10,
          totalCost: 30,
          usage: 'external',
          receiver: '外部实验室',
        },
      ],
      totalCost: 30,
      operator: 'admin',
      status: 'completed',
      remark: '保留批次',
      createdAt: '2026-06-17 09:00:00',
    }

    expect(mapOutboundRecordToForm(record)).toMatchObject({
      type: 'project',
      projectId: 'project-1',
      caseNo: 'CASE-001',
      items: [
        {
          materialId: 'material-1',
          batchId: 'batch-late',
          quantity: 3,
          usage: 'external',
          receiver: '外部实验室',
        },
      ],
      remark: '保留批次',
    })
  })
})
