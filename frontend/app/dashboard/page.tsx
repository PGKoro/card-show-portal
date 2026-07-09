"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/AuthContext";
import { dashboardPathForRole } from "@/lib/auth";

// No role picker — DashboardLayout already guarantees a signed-in, fully
// onboarded user by the time this renders, so just send them straight to
// their own dashboard. Nobody gets to choose a different role's view.
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace(dashboardPathForRole(user.role));
    }
  }, [user, router]);

  return null;
}
