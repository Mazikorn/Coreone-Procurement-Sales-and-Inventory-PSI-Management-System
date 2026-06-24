import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AlertBanner, buildDashboardAlertUrl } from './AlertBanner'
import type { AlertItem } from '../hooks/useDashboardPage'

const lowStockAlert: AlertItem = {
  id: 'alert-low-1',
  type: 'low-stock',
  level: 'danger',
  materialName: '低库存试剂',
  message: '低库存试剂库存不足',
  currentStock: 1,
  threshold: 5,
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderBanner(alerts: AlertItem[] = [lowStockAlert]) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AlertBanner alerts={alerts} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('AlertBanner', () => {
  it('builds a pending alert work link with keyword and normalized type', () => {
    expect(buildDashboardAlertUrl(lowStockAlert)).toBe(
      `/alerts?keyword=${encodeURIComponent('低库存试剂')}&type=stock_low&quick=pending`,
    )
  })

  it('opens the clicked pending alert in a filtered alert list', () => {
    renderBanner()

    fireEvent.click(screen.getByText('低库存试剂'))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/alerts?keyword=${encodeURIComponent('低库存试剂')}&type=stock_low&quick=pending`,
    )
  })

  it('opens all pending alerts from the banner header', () => {
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: /查看全部/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/alerts?quick=pending')
  })

  it('tells users the pending alert list is an action queue with reviewable handling records', () => {
    renderBanner()

    expect(screen.getByText('进入后可处理、忽略并回看留痕')).toBeInTheDocument()
  })
})
