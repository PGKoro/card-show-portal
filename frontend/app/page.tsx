import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Card Show Portal</h1>
      <p className="max-w-xl text-gray-600 dark:text-gray-300">
        The marketplace for sports card shows and dealers — find upcoming shows,
        book booths, and connect buyers with vendors.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
