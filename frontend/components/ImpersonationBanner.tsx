"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/AuthContext";
import {
  clearStashedAdminTokens,
  getStashedAdminTokens,
  saveTokens,
} from "@/lib/auth";

/**
 * Persistent bar shown across the whole app while an admin is impersonating
 * another user — makes it unambiguous which session is active and gives a
 * one-click way back to the admin's own account.
 *
 * Derives visibility directly from localStorage on every render rather than
 * mirroring it into state — the component already re-renders whenever
 * `user` changes (login, impersonation start/exit all go through
 * AuthContext), so a separate effect+setState round trip isn't needed.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [exiting, setExiting] = useState(false);

  const stashedAdminTokens = getStashedAdminTokens();
  if (!stashedAdminTokens) return null;

  async function exitImpersonation() {
    const adminTokens = getStashedAdminTokens();
    if (!adminTokens) return;
    setExiting(true);
    try {
      clearStashedAdminTokens();
      const adminUser = await login(adminTokens);
      saveTokens(adminTokens);
      router.push(`/dashboard/${adminUser.role}`);
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Viewing as <span className="font-semibold">{user ? `${user.first_name} ${user.last_name}`.trim() || user.email : "…"}</span>
      </span>
      <button
        type="button"
        onClick={exitImpersonation}
        disabled={exiting}
        className="rounded-md bg-amber-950 px-2.5 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
