import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocationFormModal } from './LocationFormModal'
import type { Location } from '@/types'
import type { FormData } from '../hooks/useLocationsPage'

function location(overrides: Partial<Location>): Location {
  return {
    id: 'loc',
    code: 'LOC-001',
    name: '测试库位',
    type: 'shelf',
    parentId: null,
    zone: 'A区',
    shelf: '',
    position: '',
    capacity: 100,
    used: 0,
    status: 'active',
    createdAt: '2026-06-20',
    ...overrides,
  }
}

const baseForm: FormData = {
  code: 'LOC-EDIT',
  name: '当前库位',
  type: 'shelf',
  parentId: '',
  levelData: ['A区'],
  capacity: 100,
  status: 'active',
}

describe('LocationFormModal', () => {
  it('only offers active non-descendant locations as parent candidates when editing', () => {
    const current = location({ id: 'current', code: 'LOC-CUR', name: '当前库位' })
    const child = location({ id: 'child', code: 'LOC-CHILD', name: '当前子库位', parentId: 'current', shelf: '01架' })
    const inactive = location({ id: 'inactive', code: 'LOC-OFF', name: '停用库位', status: 'inactive' })
    const valid = location({ id: 'valid', code: 'LOC-OK', name: '可选父级', zone: 'B区' })
    const data = [current, child, inactive, valid]

    render(
      <LocationFormModal
        open
        type="edit"
        form={baseForm}
        editingId="current"
        data={data}
        flatLocations={new Map(data.map(item => [item.id, item]))}
        levelConfigs={{ shelf: ['库区', '货架', '库位'] }}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('无（作为顶级库位）'))

    expect(screen.getByText('📦 可选父级 (B区)')).toBeInTheDocument()
    expect(screen.queryByText('📦 当前库位 (A区)')).not.toBeInTheDocument()
    expect(screen.queryByText('📦 当前子库位 (A区)')).not.toBeInTheDocument()
    expect(screen.queryByText('📦 停用库位 (A区)')).not.toBeInTheDocument()
  })
})
