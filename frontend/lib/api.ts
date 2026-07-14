import { clearTokens, getRefreshToken, saveTokens } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_REFRESH_PATH = "/auth/token/refresh/";

/** Shape of a DRF PageNumberPagination response (see apps.core.pagination). */
export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string;
};

function rawFetch(path: string, method: string, body: unknown, accessToken?: string) {
  return fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function toResult<T>(response: Response): Promise<T> {
  const data = response.status !== 204 ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data as T;
}

// Access tokens are short-lived (see SIMPLE_JWT.ACCESS_TOKEN_LIFETIME); a
// session left open past that gets a 401 on its next request. This dedupes
// concurrent refreshes (several dashboard fetches can 401 at once) so only
// one call to the refresh endpoint goes out.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const refresh = getRefreshToken();
  if (!refresh) {
    return Promise.reject(new ApiError(401, null));
  }

  refreshPromise = rawFetch(TOKEN_REFRESH_PATH, "POST", { refresh }, undefined)
    .then((response) => toResult<{ access: string; refresh?: string }>(response))
    .then((data) => {
      // ROTATE_REFRESH_TOKENS is on, so a fresh refresh token comes back too.
      saveTokens({ access: data.access, refresh: data.refresh ?? refresh });
      return data.access;
    })
    .catch((err) => {
      clearTokens();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Shared by apiFetch and apiFetchMultipart: retries once via a refreshed
// access token on a 401, using whatever request-builder the caller needs
// (JSON body vs FormData have different headers/serialization).
async function fetchWithRefresh(
  path: string,
  accessToken: string | undefined,
  buildRequest: (token?: string) => Promise<Response>,
): Promise<Response> {
  const response = await buildRequest(accessToken);

  if (response.status === 401 && accessToken && path !== TOKEN_REFRESH_PATH) {
    try {
      const newAccessToken = await refreshAccessToken();
      return await buildRequest(newAccessToken);
    } catch {
      // Refresh token is missing/expired too — fall through and surface the
      // original 401 so callers handle it the same way as any other error.
    }
  }

  return response;
}

/**
 * Thin fetch wrapper for the Django REST Framework backend. Endpoints are
 * versioned under /api/v1/ (see backend/config/urls.py). A 401 on an
 * authenticated call is treated as an expired access token: it's silently
 * refreshed once and the request retried, so a session doesn't just stop
 * working partway through a page (see SIMPLE_JWT.ACCESS_TOKEN_LIFETIME).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, accessToken } = options;
  const response = await fetchWithRefresh(path, accessToken, (token) =>
    rawFetch(path, method, body, token),
  );
  return toResult<T>(response);
}

/**
 * Like apiFetch, but for multipart/form-data (file uploads) — used for the
 * event floor map's image upload. Don't set a Content-Type header
 * manually; the browser fills in the correct multipart boundary for a
 * FormData body on its own.
 */
export async function apiFetchMultipart<T>(
  path: string,
  formData: FormData,
  options: { method?: "POST" | "PATCH" | "PUT"; accessToken?: string } = {},
): Promise<T> {
  const { method = "POST", accessToken } = options;
  const buildRequest = (token?: string) =>
    fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
  const response = await fetchWithRefresh(path, accessToken, buildRequest);
  return toResult<T>(response);
}

/**
 * Pulls a human-readable message out of a DRF-style validation error body,
 * e.g. {"email": ["A user is already registered with this email address."]}
 * or {"non_field_errors": ["Unable to log in with provided credentials."]}.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const body = err.body as Record<string, unknown>;
    for (const key of ["non_field_errors", "email", "password1", "password2", "detail"]) {
      const value = body[key];
      if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0];
      }
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return fallback;
}
