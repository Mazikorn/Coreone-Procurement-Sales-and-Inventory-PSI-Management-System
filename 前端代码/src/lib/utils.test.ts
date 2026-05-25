import { describe, it, expect } from 'vitest'
import { cn, formatDate, formatDateTime, formatNumber, formatCurrency } from './utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge tailwind classes', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4')
    })

    it('should handle conditional classes', () => {
      expect(cn('base', false && 'hidden', 'block')).toBe('base block')
    })
  })

  describe('formatDate', () => {
    it('should format date string to zh-CN', () => {
      expect(formatDate('2024-01-15')).toBe('2024/01/15')
    })

    it('should return dash for empty input', () => {
      expect(formatDate('')).toBe('-')
    })
  })

  describe('formatDateTime', () => {
    it('should format datetime to zh-CN', () => {
      const result = formatDateTime('2024-01-15T08:30:00')
      expect(result).toContain('2024/01/15')
    })

    it('should return dash for empty input', () => {
      expect(formatDateTime('')).toBe('-')
    })
  })

  describe('formatNumber', () => {
    it('should format number with decimals', () => {
      expect(formatNumber(1234.5)).toBe('1,234.50')
    })

    it('should return dash for undefined', () => {
      expect(formatNumber(undefined)).toBe('-')
    })
  })

  describe('formatCurrency', () => {
    it('should format number as currency', () => {
      expect(formatCurrency(1234.5)).toBe('¥1,234.50')
    })

    it('should return dash for null', () => {
      expect(formatCurrency(null as any)).toBe('-')
    })
  })
})
