"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS_HIDDEN_ON = ["/login", "/signup"];

// Rendered once from the root layout so every page — landing, browse, and
// all three dashboards — shares the same header. There's no real session,
// so the links are always the same regardless of "who" is looking at them.
// On the auth pages, the header stays but the page-navigation links and
// auth buttons are hidden — you're already on (or choosing between) those
// exact pages, so they'd just be redundant/distracting there.
export function NavBar() {
  const pathname = usePathname();
  const showNavLinks = !NAV_LINKS_HIDDEN_ON.includes(pathname);

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex min-h-[69px] max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-2">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-navy">
          Showfloor
        </Link>

        {showNavLinks && (
          <>
            <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
              <Link href="/vendors" className="hover:text-gray-900">
                Browse Vendors
              </Link>
              <Link href="/cards" className="hover:text-gray-900">
                Browse Cards
              </Link>
              <Link href="/dashboard" className="hover:text-gray-900">
                My Account
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
              >
                Sign up
              </Link>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
