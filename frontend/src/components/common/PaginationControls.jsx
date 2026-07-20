const PAGE_WINDOW = 5

function pageRange(currentPage, totalPages) {
  if (totalPages <= PAGE_WINDOW) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const half = Math.floor(PAGE_WINDOW / 2)
  let start = Math.max(1, currentPage - half)
  let end = Math.min(totalPages, start + PAGE_WINDOW - 1)
  start = Math.max(1, end - PAGE_WINDOW + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export default function PaginationControls({ page = 1, count = 0, pageSize = 100, onPageChange }) {
  const totalPages = Math.ceil(Number(count || 0) / Number(pageSize || 100))
  if (totalPages <= 1) return null

  const currentPage = Math.min(Math.max(Number(page || 1), 1), totalPages)
  const pages = pageRange(currentPage, totalPages)

  const buttonClass = 'inline-flex min-h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 px-4 py-4">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange?.(currentPage - 1)}
        className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
      >
        Previous
      </button>
      {pages[0] > 1 && (
        <>
          <button type="button" onClick={() => onPageChange?.(1)} className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>1</button>
          {pages[0] > 2 && <span className="px-1 text-sm font-semibold text-slate-400">...</span>}
        </>
      )}
      {pages.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPageChange?.(item)}
          className={item === currentPage
            ? `${buttonClass} border-slate-950 bg-slate-950 text-white`
            : `${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        >
          {item}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-sm font-semibold text-slate-400">...</span>}
          <button type="button" onClick={() => onPageChange?.(totalPages)} className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>{totalPages}</button>
        </>
      )}
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange?.(currentPage + 1)}
        className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
      >
        Next
      </button>
    </div>
  )
}
