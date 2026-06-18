import { describe, expect, it, vi, afterEach } from 'vitest'
import { generateNo } from './generateNo.js'

describe('generateNo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('同一毫秒内连续生成业务编号时不重复', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T08:30:15.123Z'))

    const numbers = Array.from({ length: 1500 }, () => generateNo('IB'))

    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers[0]).toBe('IB-20260617-015123-000')
    expect(numbers[1]).toBe('IB-20260617-015123-001')
  })
})
