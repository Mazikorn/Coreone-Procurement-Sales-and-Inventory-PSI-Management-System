import React from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import type { LogArchiveChainVerification, LogArchiveCredential, LogArchiveReportSignature } from '@/api/logs'

interface Props {
  archives: LogArchiveCredential[]
  onVerify: () => void
  onExportReport: () => void
  verifying: boolean
  exportingReport: boolean
  reportSignature: LogArchiveReportSignature | null
  verification: LogArchiveChainVerification | null
}

function hashPrefix(value?: string | null) {
  return value ? value.slice(0, 12) : '无'
}

function protectedSummary(archive: LogArchiveCredential) {
  const counts = archive.protectedFactCounts || {}
  return [
    `库存流水 ${counts.stock || 0}`,
    `批次库位 ${counts.batchLocation || 0}`,
    `成本审计 ${counts.abc || 0}`,
    `对账修正 ${counts.reconciliation || 0}`,
  ].join(' / ')
}

function keyGovernanceText(signature: LogArchiveReportSignature) {
  const governance = signature.keyGovernance
  if (!governance) return ''
  if (governance.status === 'active') {
    return `密钥轮换正常，${governance.rotationDueAt || '未提供到期日'} 前轮换`
  }
  if (governance.status === 'rotation_due') {
    return `密钥已到轮换期，应在 ${governance.rotationDueAt || '当前周期'} 前完成轮换`
  }
  if (governance.status === 'invalid_configuration') {
    return '密钥轮换配置无效，请检查创建日期和轮换周期'
  }
  return '未配置签名密钥轮换策略'
}

function externalArchiveSummary(archive: LogArchiveCredential) {
  const externalArchive = archive.externalArchive
  if (!externalArchive || externalArchive.status !== 'exported') return '未配置外部归档包'
  const packageHash = hashPrefix(externalArchive.packageHash)
  const governance = externalArchive.storageGovernance
  if (governance?.status === 'declared') {
    const modeLabel = governance.mode === 'worm' ? 'WORM' : '留存锁'
    return `外部包 ${packageHash} / ${modeLabel} 至 ${governance.retentionUntil || '未提供日期'}`
  }
  if (governance?.status === 'insufficient_retention') {
    return `外部包 ${packageHash} / 留存期限不足，需覆盖至 ${governance.requiredRetentionUntil || '当前日期'}`
  }
  if (governance?.status === 'invalid_configuration') {
    return `外部包 ${packageHash} / 存储治理配置无效`
  }
  return `外部包 ${packageHash} / 未声明留存锁`
}

export function LogArchiveCredentialsPanel({ archives, onVerify, onExportReport, verifying, exportingReport, reportSignature, verification }: Props) {
  if (!archives.length) return null
  const keyGovernanceLabel = reportSignature ? keyGovernanceText(reportSignature) : ''

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          <h2 className="text-sm font-semibold text-gray-900">最近归档凭证</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying}
            className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying ? '验证中...' : '验证归档链'}
          </button>
          <button
            type="button"
            onClick={onExportReport}
            disabled={exportingReport}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingReport ? '导出中...' : '导出验证报告'}
          </button>
        </div>
      </div>
      {reportSignature && (
        <div className={`border-b px-5 py-3 text-sm ${reportSignature.status === 'signed' ? 'border-green-100 bg-green-50 text-green-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
          <div className="font-medium">
            {reportSignature.status === 'signed' ? '验证报告已签名' : '验证报告未签名'}
          </div>
          <div className="mt-1 text-xs">
            {reportSignature.status === 'signed'
              ? `${reportSignature.algorithm} / ${reportSignature.keyId}`
              : '未配置签名密钥，导出报告仅包含哈希校验'}
          </div>
          {keyGovernanceLabel && (
            <div className="mt-1 text-xs">{keyGovernanceLabel}</div>
          )}
        </div>
      )}
      {verification && (
        <div className={`border-b px-5 py-3 text-sm ${verification.valid ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {verification.valid
            ? `归档链已验证，${verification.checkedCount} 份归档连续可信`
            : `归档链验证异常：${verification.brokenArchiveNo || '未知归档'} ${verification.brokenReason || ''}`.trim()}
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {archives.map(archive => (
          <div key={archive.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="text-sm font-medium text-gray-900">{archive.archiveNo}</div>
              <div className="mt-1 text-xs text-gray-500">
                清理 {archive.beforeDate} 前，归档 {archive.rowCount} 条，由 {archive.createdBy || '系统'} 生成
              </div>
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <div>内容哈希: <span className="font-mono text-gray-900">{hashPrefix(archive.contentHash)}</span></div>
              <div>链哈希: <span className="font-mono text-gray-900">{hashPrefix(archive.chainHash)}</span></div>
              <div>上一链哈希: <span className="font-mono text-gray-900">{hashPrefix(archive.previousChainHash)}</span></div>
            </div>
            <div className="text-xs text-gray-600">
              <div className="font-medium text-gray-700">受保护事实未清理</div>
              <div className="mt-1">{protectedSummary(archive)}</div>
              <div className="mt-2 font-medium text-gray-700">外部归档治理</div>
              <div className="mt-1">{externalArchiveSummary(archive)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
