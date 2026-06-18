import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChangePage?: (page: number) => void
  onChangePageSize?: (pageSize: number) => void
  onChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export function Pagination({
  page,
  pageSize,
  total,
  onChangePage,
  onChangePageSize,
  onChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages
  const handlePageChange = onChangePage ?? onChange
  const handlePageSizeChange = onChangePageSize ?? onPageSizeChange

  const pages = getVisiblePages(currentPage, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      {handlePageSizeChange && (
        <select
          value={pageSize}
          onChange={event => handlePageSizeChange(Number(event.target.value))}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          aria-label="每页条数"
        >
          {pageSizeOptions.map(option => (
            <option key={option} value={option}>
              {option} 条/页
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => canPrev && handlePageChange?.(currentPage - 1)}
          disabled={!canPrev || !handlePageChange}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="inline-flex h-9 w-9 items-center justify-center text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => handlePageChange?.(item)}
              disabled={!handlePageChange}
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3',
                item === currentPage
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              )}
              aria-current={item === currentPage ? 'page' : undefined}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => canNext && handlePageChange?.(currentPage + 1)}
          disabled={!canNext || !handlePageChange}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function getVisiblePages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages]
}
