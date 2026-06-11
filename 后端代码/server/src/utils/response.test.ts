import { describe, it, expect, vi } from 'vitest'
import { success, successList, error } from './response.js'
import type { Response } from 'express'

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  return res
}

describe('response utils', () => {
  describe('success', () => {
    it('should return success response with data', () => {
      const res = createMockRes()
      success(res, { id: '1', name: 'test' })

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: '1', name: 'test' },
        message: '操作成功',
      })
    })

    it('should return custom status code and message', () => {
      const res = createMockRes()
      success(res, null, '创建成功', 201)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: '创建成功',
      })
    })
  })

  describe('successList', () => {
    it('should return paginated list response', () => {
      const res = createMockRes()
      const list = [{ id: '1' }, { id: '2' }]
      successList(res, list, 1, 10, 25)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          list,
          page: 1,
          pageSize: 10,
          total: 25,
          totalPages: 3,
          pagination: {
            page: 1,
            pageSize: 10,
            total: 25,
            totalPages: 3,
          },
        },
      })
    })

    it('should normalize invalid page number', () => {
      const res = createMockRes()
      successList(res, [], 0, 10, 0)

      const callArg = (res.json as any).mock.calls[0][0]
      expect(callArg.data.page).toBe(1)
      expect(callArg.data.pagination.page).toBe(1)
    })
  })

  describe('error', () => {
    it('should return error response with safe message in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const res = createMockRes()
      error(res, '数据库连接失败', 'DB_ERROR', 500)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'DB_ERROR',
          message: '服务器内部错误，请稍后重试',
        },
      })

      process.env.NODE_ENV = originalEnv
    })

    it('should return detailed message in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const res = createMockRes()
      error(res, '参数错误', 'VALIDATION_ERROR', 400)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '参数错误',
        },
      })

      process.env.NODE_ENV = originalEnv
    })
  })
})
