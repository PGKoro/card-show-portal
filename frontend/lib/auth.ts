// TODO(production): tokens are kept in localStorage for now, which is
// readable by any JS running on the page (XSS risk). Before a real
// production launch, move these into an httpOnly cookie set by a Next.js
// API route/server action, and have the API client call through that route
// instead of hitting the Django API directly from the browser. Wiring that
// up properly is a meaningfully bigger change (every request would need to
// go through a Next-side proxy that reads the cookie server-side and
// attaches the Authorization header), so it's deferred past this pass.

const ACCESS_TOKEN_KEY = "showfloor.accessToken";
const REFRESH_TOKEN_KEY = "showfloor.refreshToken";

export type AuthTokens = {
  access: string;
  refresh: string;
};

export function saveTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export type UserRole = "vendor" | "customer" | "admin";

export function dashboardPathForRole(role: string): string {
  switch (role) {
    case "vendor":
      return "/dashboard/vendor";
    case "admin":
      return "/dashboard/admin";
    default:
      return "/dashboard/customer";
  }
}

/**
 * Where to send a user right after login/registration/an onboarding step.
 * Onboarding is two steps — /onboarding (name + role) then
 * /onboarding/customer or /onboarding/vendor (role-specific details) — so a
 * user who logs back in partway through needs to resume at the right step,
 * not restart from the beginning.
 */
export function postAuthPath(user: {
  first_name: string;
  role: string;
  onboarding_completed: boolean;
}): string {
  if (!user.onboarding_completed) {
    return user.first_name ? `/onboarding/${user.role}` : "/onboarding";
  }
  return dashboardPathForRole(user.role);
}
