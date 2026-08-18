"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/AuthContext";
import { dashboardPathForRole } from "@/lib/auth";
import { CARDS_FEATURE_ENABLED, SET_REGISTRY_FEATURE_ENABLED } from "@/lib/features";

const HEADER_HIDDEN_ON = ["/login", "/signup"];

const NAV_LINKS = [
  { href: "/vendors", label: "Browse Vendors", enabled: true },
  { href: "/cards", label: "Browse Cards", enabled: CARDS_FEATURE_ENABLED },
  { href: "/events", label: "Browse Events", enabled: true },
  { href: "/set-registry", label: "Set Registry", enabled: SET_REGISTRY_FEATURE_ENABLED },
].filter((link) => link.enabled);

// Rendered once from the root layout so every page — landing, browse, and
// all three dashboards — shares the same header. Reflects real auth state
// from AuthContext: signed-out visitors see Log in/Sign up, signed-in
// visitors see a profile chip linking straight to their own dashboard.
// Log out lives at the bottom of the dashboard pages themselves
// (DashboardLayout), not here — it's an account-page action, not a global
// header fixture. Hidden entirely on the auth pages, which use their own
// minimal brand treatment. /onboarding is a prefix match since it covers
// /onboarding, /onboarding/customer, and /onboarding/vendor.
//
// Below the md breakpoint, the browse links + auth actions collapse behind
// a hamburger toggle instead of wrapping onto extra header rows — the
// wrapped layout ran out of room fast on phone-width screens.
export function NavBar() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Any client-side navigation should close an open mobile menu — otherwise
  // it stays open floating over the next page. Reset during render (rather
  // than an effect) by tracking the pathname that was open when it last
  // rendered, per React's recommended "adjusting state on prop change"
  // pattern — avoids the extra render an effect-based reset would cause.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

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
        <nav className="mx-auto flex min-h-[69px] max-w-7xl items-center px-4 py-2 sm:px-6">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-navy">
            Collectors Village
          </span>
        </nav>
      </header>
    );
  }

  const initials = user
    ? (user.first_name?.[0] ?? user.email[0]).toUpperCase() + (user.last_name?.[0] ?? "").toUpperCase()
    : "";

  const profileChip = user && (
    <Link
      href={dashboardPathForRole(user.role)}
      className="flex items-center gap-2 hover:opacity-80"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
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
  );

  return (
    <header className="relative border-b border-gray-200 bg-white">
      <nav className="mx-auto flex min-h-[69px] max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-brand-navy sm:text-lg"
          >
            Collectors Village
          </Link>

          <div className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-gray-900">
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {isLoading ? null : user ? (
            <Link
              href={dashboardPathForRole(user.role)}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
                {initials}
                {(user.role === "admin" || user.role === "owner") && (
                  <span
                    title={user.role === "owner" ? "Owner" : "Admin"}
                    aria-label={user.role === "owner" ? "Owner" : "Admin"}
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
            profileChip
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

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 md:hidden"
        >
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium text-gray-600">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2.5 hover:bg-gray-50 hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            {isLoading ? null : user ? (
              <div className="px-3 py-1.5">{profileChip}</div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className="rounded-md px-3 py-2.5 text-center text-sm font-medium hover:bg-gray-50"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-brand-blue px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-navy"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
