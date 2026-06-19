import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectCopyModal } from './ProjectCopyModal'
import type { Project } from '@/types'
import type { FormData } from '../hooks/useProjectsPage'

const project: Project = {
  id: 'prj-copy-source',
  code: 'PRJ-001',
  name: '免疫组化检测',
  type: 'ihc',
  status: 'active',
  bomId: 'bom-1',
  bomName: '免疫组化BOM',
  description: '原服务说明',
  createdAt: '2026-06-19',
}

const form: FormData = {
  type: 'ihc',
  code: 'PRJ-001-COPY',
  name: '免疫组化检测 副本',
  cycle: '2天',
  manager: '张三',
  status: 'active',
  description: '原服务说明',
  bomId: 'bom-1',
}

describe('ProjectCopyModal', () => {
  it('allows editing the generated code and description before copying', () => {
    const onChange = vi.fn()

    render(
      <ProjectCopyModal
        open
        editingRow={project}
        form={form}
        isSubmitting={false}
        onClose={vi.fn()}
        onChange={onChange}
        onConfirm={vi.fn()}
      />
    )

    const codeInput = screen.getByLabelText(/新服务编号/)
    fireEvent.change(codeInput, { target: { value: 'PRJ-001-COPY-A' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PRJ-001-COPY-A',
      bomId: 'bom-1',
    }))

    const descriptionInput = screen.getByLabelText(/新服务描述/)
    fireEvent.change(descriptionInput, { target: { value: '复制后调整说明' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      description: '复制后调整说明',
      bomId: 'bom-1',
    }))
  })
})
