import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SupplierFormModal } from './SupplierFormModal'
import type { FormData } from '../hooks/useSuppliersPage'

const form: FormData = {
  code: 'SUP-001',
  name: '华东供应商',
  contact: '李采购',
  phone: '13800138000',
  email: 'purchase@example.com',
  address: '上海市浦东新区',
  taxNo: '91310000MA1K000001',
  bankName: '上海银行',
  bankAccount: '6222000000000000',
  status: 'active',
}

describe('SupplierFormModal', () => {
  it('summarizes supplier result and downstream chains before saving', () => {
    render(
      <SupplierFormModal
        open
        type="create"
        form={form}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('供应商结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：采购订单、入库、供应商退货、供应商成本净额、物料主数据、审计记录')).toBeInTheDocument()
    expect(screen.getByText('供应商 华东供应商')).toBeInTheDocument()
    expect(screen.getByText('联系人 李采购 / 13800138000')).toBeInTheDocument()
    expect(screen.getByText('合作状态 合作中')).toBeInTheDocument()
    expect(screen.getByText('结算信息 已填写')).toBeInTheDocument()
    expect(screen.getByText('税号 91310000MA1K000001')).toBeInTheDocument()
  })
})
