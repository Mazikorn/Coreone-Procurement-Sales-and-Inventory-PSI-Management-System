import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ActivityItem } from './ActivityItem'
import type { ActivityItem as ActivityItemType } from '../hooks/useDashboardPage'

const activity: ActivityItemType = {
  id: 'out-outbound-1',
  type: 'outbound',
  title: '出库：OUT-001',
  desc: 'HE项目 · 仓管',
  time: '刚刚',
  href: '/outbound?keyword=OUT-001',
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

describe('ActivityItem', () => {
  it('opens the activity business record when a deep link is available', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ActivityItem item={activity} />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /出库：OUT-001/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/outbound?keyword=OUT-001')
  })
})
