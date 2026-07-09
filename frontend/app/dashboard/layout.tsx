"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { useAuth } from "@/lib/AuthContext";
import { postAuthPath } from "@/lib/auth";

// Simple guard: once the initial "is there a valid session?" check
// (AuthContext) resolves, redirect to /login if it turns out there's no
// user, or to whichever onboarding step is next if onboarding isn't done.
// The check only runs once (guarded by checkedRef) — otherwise it would
// also fire when `user` later goes null because of an explicit logout, and
// race against this component's own redirect to "/" for that case.
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

  return (
    <>
      {children}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <div className="border-t border-gray-200 pt-6 text-center dark:border-gray-800">
          <button
            onClick={handleLogout}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
