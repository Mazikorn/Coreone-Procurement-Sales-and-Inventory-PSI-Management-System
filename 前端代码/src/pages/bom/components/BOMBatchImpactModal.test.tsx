import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BOMBatchImpactModal } from './BOMBatchImpactModal'
import type { BOM, BOMDeleteCheck, BOMStatusCheck } from '@/types'

const bom: BOM = {
  id: 'bom-1',
  code: 'BOM-001',
  name: '免疫组化BOM',
  version: 'v1.0',
  type: 'ihc',
  materialCount: 1,
  unitCost: 10,
  status: 'active',
  materials: [],
  versionHistory: [],
  createdAt: '2026-06-18',
  updatedAt: '2026-06-18',
}

describe('BOMBatchImpactModal', () => {
  it('shows delete blockers and disables confirm when any selected BOM is referenced', () => {
    const check: BOMDeleteCheck = {
      bom: { id: 'bom-1', code: 'BOM-001', name: '免疫组化BOM' },
      deletable: false,
      impacts: { projectCount: 1, outboundDetailCount: 1 },
      reasons: ['存在 1 个检测项目引用', '存在 1 条出库成本明细引用'],
    }

    render(
      <BOMBatchImpactModal
        open
        action="delete"
        targetsCount={1}
        deleteResults={[{ bom, check }]}
        statusResults={[]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量删除BOM')).toBeInTheDocument()
    expect(screen.getByText('检测项目 1，出库成本明细 1')).toBeInTheDocument()
    expect(screen.getByText('存在阻断项，批量操作不会执行。请先处理对应检测项目引用、成本明细引用或不可用依赖。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认删除/ })).toBeDisabled()
  })

  it('shows status blockers and disables confirm when any selected BOM is used by active project', () => {
    const check: BOMStatusCheck = {
      bom: { id: 'bom-1', code: 'BOM-001', name: '免疫组化BOM' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeProjectCount: 1,
        inactiveMaterialCount: 0,
        inactiveEquipmentCount: 0,
        inactiveEquipmentTypeCount: 0,
      },
      reasons: ['存在 1 个启用检测项目引用'],
    }

    render(
      <BOMBatchImpactModal
        open
        action="inactive"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ bom, check }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量停用BOM')).toBeInTheDocument()
    expect(screen.getByText('启用检测项目 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认停用/ })).toBeDisabled()
  })

  it('shows activation dependency blockers before enabling BOMs', () => {
    const check: BOMStatusCheck = {
      bom: { id: 'bom-1', code: 'BOM-001', name: '免疫组化BOM' },
      targetStatus: 'active',
      canChange: false,
      impacts: {
        activeProjectCount: 0,
        inactiveMaterialCount: 1,
        inactiveEquipmentCount: 1,
        inactiveEquipmentTypeCount: 1,
      },
      reasons: [
        '存在 1 个停用或已删除物料依赖',
        '存在 1 个未启用设备依赖',
        '存在 1 个未启用设备类型依赖',
      ],
    }

    render(
      <BOMBatchImpactModal
        open
        action="active"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ bom, check }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量启用BOM')).toBeInTheDocument()
    expect(screen.getByText('停用物料 1，未启用设备 1，未启用设备类型 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认启用/ })).toBeDisabled()
  })

  it('shows missing core material blocker before enabling BOMs', () => {
    const check: BOMStatusCheck = {
      bom: { id: 'bom-1', code: 'BOM-001', name: '免疫组化BOM' },
      targetStatus: 'active',
      canChange: false,
      impacts: {
        activeProjectCount: 0,
        coreMaterialCount: 0,
        inactiveMaterialCount: 0,
        inactiveEquipmentCount: 0,
        inactiveEquipmentTypeCount: 0,
      },
      reasons: ['缺少核心物料明细'],
    }

    render(
      <BOMBatchImpactModal
        open
        action="active"
        targetsCount={1}
        deleteResults={[]}
        statusResults={[{ bom, check }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量启用BOM')).toBeInTheDocument()
    expect(screen.getByText('核心物料缺失 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认启用/ })).toBeDisabled()
  })
})
