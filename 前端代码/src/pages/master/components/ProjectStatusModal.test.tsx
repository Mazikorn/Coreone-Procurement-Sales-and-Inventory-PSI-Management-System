import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectStatusModal } from './ProjectStatusModal'
import { ProjectBatchStatusModal } from './ProjectBatchStatusModal'
import type { Project, ProjectStatusCheck } from '@/types'

const project: Project = {
  id: 'prj-1',
  code: 'PRJ-001',
  name: '免疫组化检测',
  type: 'ihc',
  status: 'active',
  createdAt: '2026-06-18',
}

describe('ProjectStatusModal', () => {
  it('shows historical impacts and keeps confirm enabled when disabling a referenced project', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 1,
        outboundCount: 1,
        lisCaseCount: 1,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: ['停用后该检测服务不能用于新出库', '已有历史出库记录会保留', '已有LIS检测记录会保留'],
    }

    render(
      <ProjectStatusModal
        open
        target={project}
        targetStatus="inactive"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('停用检测服务')).toBeInTheDocument()
    expect(screen.getByText('关联BOM')).toBeInTheDocument()
    expect(screen.getByText('出库记录')).toBeInTheDocument()
    expect(screen.getByText('LIS记录')).toBeInTheDocument()
    expect(screen.getByText('停用后该检测服务不能用于新出库；已有历史出库记录会保留；已有LIS检测记录会保留。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认停用' })).not.toBeDisabled()
  })

  it('blocks enabling when the bound BOM is unavailable', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'active',
      canChange: false,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 0,
        outboundCount: 0,
        lisCaseCount: 0,
        invalidBomCount: 1,
      },
      reasons: ['停用BOM不能关联到检测服务'],
      warnings: [],
    }

    render(
      <ProjectStatusModal
        open
        target={{ ...project, status: 'inactive' }}
        targetStatus="active"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法启用检测服务')).toBeInTheDocument()
    expect(screen.getByText('不可用BOM')).toBeInTheDocument()
    expect(screen.getByText('停用BOM不能关联到检测服务，请先修正BOM配置后再启用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认启用' })).toBeDisabled()
  })

  it('shows batch disabling warnings and keeps confirm enabled when only historical impacts exist', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 0,
        outboundCount: 1,
        lisCaseCount: 1,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: ['停用后该检测服务不能用于新出库', '已有历史出库记录会保留'],
    }

    render(
      <ProjectBatchStatusModal
        open
        action="inactive"
        targetsCount={1}
        results={[{ project, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量停用检测服务')).toBeInTheDocument()
    expect(screen.getByText('停用后该检测服务不能用于新出库；已有历史出库记录会保留')).toBeInTheDocument()
    expect(screen.getByText('存在历史业务影响，确认后会保留原有 BOM、出库和 LIS 记录，仅更新服务状态。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认停用/ })).not.toBeDisabled()
  })

  it('blocks batch enabling when any selected project has unavailable BOM', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'active',
      canChange: false,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 0,
        outboundCount: 0,
        lisCaseCount: 0,
        invalidBomCount: 1,
      },
      reasons: ['停用BOM不能关联到检测服务'],
      warnings: [],
    }

    render(
      <ProjectBatchStatusModal
        open
        action="active"
        targetsCount={1}
        results={[{ project: { ...project, status: 'inactive' }, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法批量启用检测服务')).toBeInTheDocument()
    expect(screen.getByText('停用BOM不能关联到检测服务')).toBeInTheDocument()
    expect(screen.getByText('存在阻断项，批量状态不会更新。请先修正对应检测服务的 BOM 配置。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认启用/ })).toBeDisabled()
  })

  it('explains downstream impact before batch disabling valid services without historical warnings', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        bomCount: 0,
        directBomCount: 0,
        serviceBomCount: 0,
        outboundCount: 0,
        lisCaseCount: 0,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: [],
    }

    render(
      <ProjectBatchStatusModal
        open
        action="inactive"
        targetsCount={1}
        results={[{ project, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量停用检测服务')).toBeInTheDocument()
    expect(screen.getByText('检查通过；停用后这些检测服务不会再用于新BOM绑定、项目出库、LIS对账、项目成本归集和审计筛选，历史记录保留。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认停用/ })).toBeEnabled()
  })

  it('explains downstream impact before batch enabling valid services', () => {
    const statusCheck: ProjectStatusCheck = {
      project: { id: 'prj-1', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'active',
      canChange: true,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 0,
        outboundCount: 0,
        lisCaseCount: 0,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: [],
    }

    render(
      <ProjectBatchStatusModal
        open
        action="active"
        targetsCount={1}
        results={[{ project: { ...project, status: 'inactive' }, check: statusCheck }]}
        checking={false}
        submitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('批量启用检测服务')).toBeInTheDocument()
    expect(screen.getByText('检查通过；启用后这些检测服务可重新用于新BOM绑定、项目出库、LIS对账、项目成本归集和审计筛选，历史记录不变。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认启用/ })).toBeEnabled()
  })
})
