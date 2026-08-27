"use client";

/** Previous | 1 2 3 | Next control with numbered page buttons — for use
 *  cases (like Collections' 10-sets-per-page set grid) where the total
 *  page count is known and jumping directly to a page number is useful.
 *  Distinct from the simpler `Pagination` component (hasNext/hasPrevious-
 *  only, no page numbers) used across the existing admin list pages. */
export function NumberedPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Keep the page-number strip short even with many pages: always show
  // the first/last page, the current page, and one neighbor each side.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav className="mt-6 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        Previous
      </button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-gray-400">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`min-w-9 rounded-md px-3 py-1.5 text-sm font-medium ${
              p === page
                ? "bg-brand-blue text-white"
                : "border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            }`}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        Next
      </button>
    </nav>
  );
}
