import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { generateClientTemporaryPassword, UserFormModal } from './UserFormModal'
import type { FormData, RoleItem } from '../hooks/useUsersPage'

const baseForm: FormData = {
  username: '',
  password: '',
  realName: '',
  role: 'pathologist',
  department: '',
  phone: '',
  email: '',
  status: 'active',
}

const roles: RoleItem[] = [
  { id: 'role-admin', code: 'admin', name: '系统管理员', userCount: 1, description: '', permissions: [] },
  { id: 'role-pathologist', code: 'pathologist', name: '病理医生', userCount: 2, description: '', permissions: [] },
  { id: 'role-finance', code: 'finance', name: '财务人员', userCount: 0, description: '', permissions: [] },
]

describe('UserFormModal', () => {
  it('generates client-side temporary passwords with Web Crypto', () => {
    const originalCrypto = globalThis.crypto
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.set([0, 1, 2, 3, 4, 5, 6, 7, 8])
      return array
    })
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues },
    })
    const randomSpy = vi.spyOn(Math, 'random')

    expect(generateClientTemporaryPassword()).toBe('Core@ABCDEFGHJ')
    expect(getRandomValues).toHaveBeenCalled()
    expect(randomSpy).not.toHaveBeenCalled()

    randomSpy.mockRestore()
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  })

  it('uses backend roles in the role selector instead of fixed demo roles', () => {
    render(
      <UserFormModal
        open
        type="create"
        form={baseForm}
        roles={roles}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onResetPassword={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('病理医生'))

    expect(screen.getByTestId('option-finance')).toHaveTextContent('财务人员')
    expect(screen.queryByTestId('option-viewer')).not.toBeInTheDocument()
  })
})
