// Same wrapper classes as the auth pages' real content (flex-1 fills the
// space between header and footer) so swapping this in for the real form
// while a guard/redirect check resolves doesn't collapse the page and snap
// the footer upward, then back down once content pops in.
export function AuthPageSpinner() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-blue dark:border-gray-700"
      />
    </main>
  );
}
