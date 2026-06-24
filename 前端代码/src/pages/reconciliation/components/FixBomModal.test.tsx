import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FixBomModal } from './FixBomModal'
import type { MaterialDiff } from '../hooks/useReconciliationPage'

const materialDiff: MaterialDiff = {
  materialId: 'mat-1',
  materialName: '苏木素',
  spec: '100ml',
  bomUsagePerSample: 1,
  bomUnit: 'ml',
  theoryQty: 10,
  actualQty: 12.5,
  actualUnit: 'ml',
  diff: 2.5,
  diffRate: 25,
  status: 'warning',
  price: 8,
  theoryUnit: 'ml',
}

describe('FixBomModal', () => {
  it('summarizes BOM correction result and downstream chains before confirming', () => {
    render(
      <FixBomModal
        open
        fixTarget={materialDiff}
        fixTargetProjectId="project-1"
        fixNewUsage={1.5}
        setFixNewUsage={vi.fn()}
        fixNewUnit="ml"
        setFixNewUnit={vi.fn()}
        fixReason="实际消耗持续偏高"
        setFixReason={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('BOM修正结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：BOM标准、理论消耗、项目对账、成本差异、异常台账、审计记录')).toBeInTheDocument()
    expect(screen.getByText('物料 苏木素')).toBeInTheDocument()
    expect(screen.getByText('原用量 1 ml/例')).toBeInTheDocument()
    expect(screen.getByText('修正为 1.5 ml/例')).toBeInTheDocument()
    expect(screen.getByText('当前差异率 25%')).toBeInTheDocument()
    expect(screen.getByText('原因 实际消耗持续偏高')).toBeInTheDocument()
  })

  it('blocks confirmation until a correction reason is provided', () => {
    render(
      <FixBomModal
        open
        fixTarget={materialDiff}
        fixTargetProjectId="project-1"
        fixNewUsage={1.5}
        setFixNewUsage={vi.fn()}
        fixNewUnit="ml"
        setFixNewUnit={vi.fn()}
        fixReason=""
        setFixReason={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('请填写修正原因，系统才能解释 BOM 标准变更并形成审计记录。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认修正' })).toBeDisabled()
  })
})
