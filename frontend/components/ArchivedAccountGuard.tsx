"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/AuthContext";

const ARCHIVED_PATH = "/account-archived";

// An archived account can still log in (see backend ArchiveUserView), but
// shouldn't be able to use anything else on the site — redirect every page
// it lands on to the "contact support" notice instead.
export function ArchivedAccountGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const shouldBlock = !isLoading && !!user?.archived && pathname !== ARCHIVED_PATH;

  useEffect(() => {
    if (!shouldBlock) return;
    router.replace(ARCHIVED_PATH);
  }, [shouldBlock, router]);

  // Render nothing instead of `children` while blocked — otherwise the
  // target page still mounts and fires its own data-fetching effects (e.g.
  // a vendor dashboard's listings fetch) before the redirect above lands,
  // and those requests now legitimately 403 (see apps.core.permissions.
  // HasRole), which surfaced as an uncaught runtime error since those pages
  // don't handle a 403 from an already-authenticated request.
  if (shouldBlock) return null;

  return <>{children}</>;
}
