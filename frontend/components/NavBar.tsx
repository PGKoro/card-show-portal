"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CardStackLogo } from "@/components/CardStackLogo";
import { useAuth } from "@/lib/AuthContext";
import { dashboardPathForRole } from "@/lib/auth";
import { CARDS_FEATURE_ENABLED, SET_REGISTRY_FEATURE_ENABLED } from "@/lib/features";

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

  // An archived account is redirected to /account-archived from every page
  // (see ArchivedAccountGuard) — none of the normal nav links would ever
  // resolve for it, so skip rendering them entirely instead of letting the
  // user click through to something that just bounces them back.
  if (user?.archived) {
    return (
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex min-h-[69px] max-w-7xl items-center px-6 py-2">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-navy">
            <CardStackLogo />
            Collectors Village
          </span>
        </nav>
      </header>
    );
  }

  const initials = user
    ? (user.first_name?.[0] ?? user.email[0]).toUpperCase() + (user.last_name?.[0] ?? "").toUpperCase()
    : "";

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex min-h-[69px] max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-brand-navy sm:text-lg"
          >
            <CardStackLogo />
            Collectors Village
          </Link>

          <div className="flex items-center gap-4 text-sm font-medium text-gray-600 sm:gap-6">
            <Link href="/vendors" className="hover:text-gray-900">
              Browse Vendors
            </Link>
            {CARDS_FEATURE_ENABLED && (
              <Link href="/cards" className="hover:text-gray-900">
                Browse Cards
              </Link>
            )}
            <Link href="/events" className="hover:text-gray-900">
              Browse Events
            </Link>
            {SET_REGISTRY_FEATURE_ENABLED && (
              <Link href="/set-registry" className="hover:text-gray-900">
                Set Registry
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? null : user ? (
            <Link
              href={dashboardPathForRole(user.role)}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                {initials}
                {user.role === "admin" && (
                  <span
                    title="Admin"
                    aria-label="Admin"
                    className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-2 ring-white"
                  >
                    <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-white" aria-hidden="true">
                      <path d="M10 1.5l6.5 2.6v4.4c0 4.4-2.8 8.3-6.5 9.8-3.7-1.5-6.5-5.4-6.5-9.8V4.1L10 1.5z" />
                    </svg>
                  </span>
                )}
              </span>
              <span className="text-sm font-medium text-gray-700">
                {user.role === "vendor" && user.business_name
                  ? user.business_name
                  : user.first_name || user.email}
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
