export function Pagination({
  page,
  hasNext,
  hasPrevious,
  onPrevious,
  onNext,
}: {
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (page === 1 && !hasNext) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        onClick={onPrevious}
        disabled={!hasPrevious}
        className="rounded-md border border-gray-300 px-3.5 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-gray-700 dark:hover:bg-gray-900"
      >
        ← Previous
      </button>
      <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="rounded-md border border-gray-300 px-3.5 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-gray-700 dark:hover:bg-gray-900"
      >
        Next →
      </button>
    </div>
  );
}
