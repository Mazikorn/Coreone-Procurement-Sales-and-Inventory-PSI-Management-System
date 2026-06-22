import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogArchiveCredentialsPanel } from './LogArchiveCredentialsPanel'

describe('LogArchiveCredentialsPanel', () => {
  it('renders archive number, hash prefixes, chain link, and protected fact counts', () => {
    const onVerify = vi.fn()
    render(
      <LogArchiveCredentialsPanel
        onVerify={onVerify}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={{
          status: 'unsigned',
          algorithm: 'HMAC-SHA256',
          keyId: 'not-configured',
          signedPayload: 'reportHash',
          missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
          keyGovernance: {
            status: 'not_configured',
            missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_KEY_GOVERNANCE_NOT_CONFIGURED',
          },
        }}
        verification={{ valid: true, checkedCount: 1, latestArchiveNo: 'LOG-ARCH-UNIT' }}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          externalArchive: {
            status: 'exported',
            storageType: 'filesystem',
            uri: '/tmp/LOG-ARCH-UNIT.archive.json',
            packageHash: 'fedcba1234567890fedcba1234567890fedcba1234567890fedcba1234567890',
            packageHashAlgorithm: 'SHA-256',
            storageGovernance: {
              status: 'not_configured',
              missingReason: 'COREONE_ARCHIVE_STORAGE_GOVERNANCE_NOT_CONFIGURED',
            },
          },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('最近归档凭证')).toBeInTheDocument()
    expect(screen.getByText('LOG-ARCH-UNIT')).toBeInTheDocument()
    expect(screen.getByText('清理 2025-12-19 前，归档 3 条，由 admin 生成')).toBeInTheDocument()
    expect(screen.getByText('abcdef123456')).toBeInTheDocument()
    expect(screen.getByText('123456abcdef')).toBeInTheDocument()
    expect(screen.getByText('库存流水 1 / 批次库位 2 / 成本审计 3 / 对账修正 4')).toBeInTheDocument()
    expect(screen.getByText('外部包 fedcba123456 / 未声明留存锁')).toBeInTheDocument()
    expect(screen.getByText('归档链已验证，1 份归档连续可信')).toBeInTheDocument()
    expect(screen.getByText('验证报告未签名')).toBeInTheDocument()
    expect(screen.getByText('未配置签名密钥，导出报告仅包含哈希校验')).toBeInTheDocument()
    expect(screen.getByText('未配置签名密钥轮换策略')).toBeInTheDocument()
  })

  it('shows signed report handoff status with key id', () => {
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={{
          status: 'signed',
          algorithm: 'HMAC-SHA256',
          keyId: 'unit-key-2026-06',
          signedPayload: 'reportHash',
          keyGovernance: {
            status: 'active',
            keyCreatedAt: '2099-01-01',
            rotationDays: 90,
            rotationDueAt: '2099-04-01',
          },
        }}
        verification={null}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('验证报告已签名')).toBeInTheDocument()
    expect(screen.getByText('HMAC-SHA256 / unit-key-2026-06')).toBeInTheDocument()
    expect(screen.getByText('密钥轮换正常，2099-04-01 前轮换')).toBeInTheDocument()
  })

  it('shows declared external archive storage governance', () => {
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={null}
        verification={null}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          externalArchive: {
            status: 'exported',
            storageType: 'filesystem',
            uri: '/tmp/LOG-ARCH-UNIT.archive.json',
            packageHash: 'fedcba1234567890fedcba1234567890fedcba1234567890fedcba1234567890',
            packageHashAlgorithm: 'SHA-256',
            storageGovernance: {
              status: 'declared',
              mode: 'retention_lock',
              retentionUntil: '2099-12-31',
              evidenceUri: 's3://coreone-audit-archives/object-lock/unit',
              enforcement: 'external_storage',
            },
          },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('外部包 fedcba123456 / 留存锁 至 2099-12-31')).toBeInTheDocument()
  })

  it('shows insufficient external archive retention instead of treating it as declared governance', () => {
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={null}
        verification={null}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-EXPIRED',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          externalArchive: {
            status: 'exported',
            storageType: 'filesystem',
            uri: '/tmp/LOG-ARCH-EXPIRED.archive.json',
            packageHash: 'fedcba1234567890fedcba1234567890fedcba1234567890fedcba1234567890',
            packageHashAlgorithm: 'SHA-256',
            storageGovernance: {
              status: 'insufficient_retention',
              mode: 'retention_lock',
              retentionUntil: '2000-01-01',
              requiredRetentionUntil: '2026-06-22',
              evidenceUri: 's3://coreone-audit-archives/object-lock/expired',
              enforcement: 'external_storage',
            },
          },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('外部包 fedcba123456 / 留存期限不足，需覆盖至 2026-06-22')).toBeInTheDocument()
  })

  it('shows when the signing key needs rotation', () => {
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={{
          status: 'signed',
          algorithm: 'HMAC-SHA256',
          keyId: 'unit-key-old',
          signedPayload: 'reportHash',
          keyGovernance: {
            status: 'rotation_due',
            keyCreatedAt: '2025-01-01',
            rotationDays: 90,
            rotationDueAt: '2025-04-01',
          },
        }}
        verification={null}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('密钥已到轮换期，应在 2025-04-01 前完成轮换')).toBeInTheDocument()
  })

  it('lets administrators verify the archive chain from the panel', async () => {
    const onVerify = vi.fn()
    render(
      <LogArchiveCredentialsPanel
        onVerify={onVerify}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={null}
        verification={null}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '验证归档链' }))

    expect(onVerify).toHaveBeenCalledTimes(1)
  })

  it('lets administrators export the verification report from the panel', () => {
    const onExportReport = vi.fn()
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={onExportReport}
        verifying={false}
        exportingReport={false}
        reportSignature={null}
        verification={{ valid: true, checkedCount: 1, latestArchiveNo: 'LOG-ARCH-UNIT' }}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '导出验证报告' }))

    expect(onExportReport).toHaveBeenCalledTimes(1)
  })

  it('shows chain verification failure without hiding the archive evidence', () => {
    render(
      <LogArchiveCredentialsPanel
        onVerify={vi.fn()}
        onExportReport={vi.fn()}
        verifying={false}
        exportingReport={false}
        reportSignature={null}
        verification={{ valid: false, checkedCount: 2, brokenArchiveNo: 'LOG-ARCH-BAD', brokenReason: 'CONTENT_HASH_MISMATCH' }}
        archives={[{
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-BAD',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 2, abc: 3, reconciliation: 4 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        }]}
      />,
    )

    expect(screen.getByText('归档链验证异常：LOG-ARCH-BAD CONTENT_HASH_MISMATCH')).toBeInTheDocument()
    expect(screen.getByText('LOG-ARCH-BAD')).toBeInTheDocument()
  })

  it('does not render when there are no archive credentials', () => {
    const { container } = render(<LogArchiveCredentialsPanel archives={[]} onVerify={vi.fn()} onExportReport={vi.fn()} verifying={false} exportingReport={false} reportSignature={null} verification={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})
