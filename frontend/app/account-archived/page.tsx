"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/AuthContext";

export default function AccountArchivedPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (isLoading || checkedRef.current) return;
    checkedRef.current = true;
    // Not logged in, or a normal (non-archived) account landing here
    // directly — nothing to show, send them on.
    if (!user) {
      router.replace("/login");
    } else if (!user.archived) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (isLoading || !user?.archived) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Your account has been archived</h1>
      <p className="mt-3 max-w-md text-gray-600 dark:text-gray-300">
        This account no longer has access to Collectors Village. If you believe this is a
        mistake, please contact support.
      </p>
      <button
        onClick={handleLogout}
        className="mt-6 rounded-md border border-gray-300 px-5 py-2.5 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
      >
        Log out
      </button>
    </main>
  );
}
