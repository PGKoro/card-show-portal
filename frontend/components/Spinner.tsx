type SpinnerProps = {
  label?: string;
  className?: string;
};

/** Inline loading indicator — drop in wherever data hasn't arrived yet
 *  (in place of a list, grid, or section) instead of leaving that area blank. */
export function Spinner({ label = "Loading", className = "" }: SpinnerProps) {
  return (
    <div className={`flex justify-center py-12 ${className}`}>
      <div
        role="status"
        aria-label={label}
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-blue dark:border-gray-700"
      />
    </div>
  );
}
