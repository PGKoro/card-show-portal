"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CardStackLogo } from "@/components/CardStackLogo";
import { useAuth } from "@/lib/AuthContext";
import { dashboardPathForRole } from "@/lib/auth";

const HEADER_HIDDEN_ON = ["/login", "/signup"];

// Rendered once from the root layout so every page — landing, browse, and
// all three dashboards — shares the same header. Reflects real auth state
// from AuthContext: signed-out visitors see Log in/Sign up, signed-in
// visitors see a profile chip linking straight to their own dashboard.
// Log out lives at the bottom of the dashboard pages themselves
// (DashboardLayout), not here — it's an account-page action, not a global
// header fixture. Hidden entirely on the auth pages, which use their own
// minimal brand/"Powered by" treatment. /onboarding is a prefix match since
// it covers /onboarding, /onboarding/customer, and /onboarding/vendor.
export function NavBar() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (HEADER_HIDDEN_ON.includes(pathname) || pathname.startsWith("/onboarding")) {
    return null;
  }

  const initials = user
    ? (user.first_name?.[0] ?? user.email[0]).toUpperCase() + (user.last_name?.[0] ?? "").toUpperCase()
    : "";

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex min-h-[69px] max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-2">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-navy">
          <CardStackLogo />
          Collectors Village
        </Link>

        <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/vendors" className="hover:text-gray-900">
            Browse Vendors
          </Link>
          <Link href="/cards" className="hover:text-gray-900">
            Browse Cards
          </Link>
          <Link href="/events" className="hover:text-gray-900">
            Browse Events
          </Link>
          <Link href="/set-registry" className="hover:text-gray-900">
            Set Registry
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? null : user ? (
            <Link
              href={dashboardPathForRole(user.role)}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="text-sm font-medium text-gray-700">
                {user.first_name || user.email}
              </span>
            </Link>
          ) : (
            <>
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
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
