"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { useAuth } from "@/lib/AuthContext";
import { postAuthPath } from "@/lib/auth";

// Simple guard: once the initial "is there a valid session?" check
// (AuthContext) resolves, redirect to /login if it turns out there's no
// user, or to whichever onboarding step is next if onboarding isn't done.
// The check only runs once (guarded by checkedRef) — otherwise it would
// also fire when `user` later goes null because of an explicit logout, and
// race against this component's own redirect to "/" for that case.
//
// `children` (the actual dashboard page) is withheld until isLoading
// resolves — otherwise it mounts and fires its own data-fetching effects
// immediately, before anyone knows whether there's even a valid/archived
// session, firing requests that are guaranteed to 403 (see
// ArchivedAccountGuard, which relies on this same isLoading window to
// avoid rendering an archived user's dashboard at all).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (isLoading || checkedRef.current) return;
    checkedRef.current = true;
    if (!user) {
      router.replace("/login");
    } else if (!user.onboarding_completed) {
      router.replace(postAuthPath(user));
    }
  }, [isLoading, user, router]);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  if (isLoading) {
    return <AuthPageSpinner />;
  }

  return (
    <>
      {children}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <div className="border-t border-gray-200 pt-6 text-center dark:border-gray-800">
          <button
            onClick={handleLogout}
            className="rounded-md border border-gray-300 px-5 py-2.5 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
