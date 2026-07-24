"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { ApiError, apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";

type Role = "customer" | "vendor" | "admin";
type SearchRole = Role | "";

type UserResult = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  archived: boolean;
  flagged: boolean;
  notes: string;
};

type Feedback = { id: number; text: string };

const PAGE_SIZE = 5;

export default function ManageAccountsPage() {
  const confirm = useConfirm();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<SearchRole>("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<UserResult[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatingPk, setUpdatingPk] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextFeedbackId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;

      if (!search.trim() && !role && !flaggedOnly) {
        setResults([]);
        setHasNext(false);
        setHasPrevious(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (role) params.set("role", role);
      if (flaggedOnly) params.set("flagged", "true");
      params.set("page_size", String(PAGE_SIZE));
      params.set("page", String(page));

      apiFetch<PaginatedResponse<UserResult>>(`/admin/users/?${params.toString()}`, {
        accessToken: getAccessToken() ?? undefined,
      })
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setHasNext(data.next !== null);
          setHasPrevious(data.previous !== null);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 404 && page > 1) {
            setPage((current) => current - 1);
            return;
          }
          throw err;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, role, flaggedOnly, page]);

  function pushFeedback(text: string) {
    const note: Feedback = { id: nextFeedbackId.current++, text };
    setFeedback((current) => [note, ...current]);
    setTimeout(() => {
      setFeedback((current) => current.filter((item) => item.id !== note.id));
    }, 4000);
  }

  async function handleSetRole(user: UserResult, nextRole: Role) {
    if (nextRole === user.role) return;

    const ok = await confirm({
      title: `Change ${user.email} to ${nextRole}?`,
      message:
        nextRole === "admin"
          ? "They'll get full admin access to this site."
          : nextRole === "vendor"
            ? "They'll need approval before they can list inventory."
            : "They'll lose vendor or admin access.",
      confirmLabel: "Change role",
      tone: nextRole === "admin" ? "danger" : "default",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      const updated = await apiFetch<UserResult>(`/admin/users/${user.pk}/set-role/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { role: nextRole },
      });
      setResults((current) =>
        current.map((item) => (item.pk === user.pk ? { ...item, role: updated.role } : item)),
      );
      pushFeedback(`${user.email} is now a${nextRole === "admin" ? "n" : ""} ${nextRole}.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  async function handleToggleArchived(user: UserResult) {
    const archiving = !user.archived;
    const ok = await confirm({
      title: archiving ? `Archive ${user.email}?` : `Restore ${user.email}?`,
      message: archiving
        ? "Archived accounts are inactive until restored."
        : "They'll regain access immediately.",
      confirmLabel: archiving ? "Archive" : "Restore",
      tone: archiving ? "danger" : "default",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      const updated = await apiFetch<UserResult>(`/admin/users/${user.pk}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { archived: archiving },
      });
      setResults((current) =>
        current.map((item) => (item.pk === user.pk ? { ...item, archived: updated.archived } : item)),
      );
      pushFeedback(archiving ? `${user.email} archived.` : `${user.email} restored.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  async function handleToggleFlagged(user: UserResult) {
    const flagging = !user.flagged;
    const ok = await confirm({
      title: flagging ? `Flag ${user.email}?` : `Unflag ${user.email}?`,
      message: flagging
        ? "This marks the account for admin review."
        : "This removes the moderation flag.",
      confirmLabel: flagging ? "Flag" : "Unflag",
      tone: flagging ? "danger" : "default",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      const updated = await apiFetch<UserResult>(`/admin/users/${user.pk}/${flagging ? "flag" : "unflag"}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      setResults((current) =>
        current.map((item) => (item.pk === user.pk ? { ...item, flagged: updated.flagged } : item)),
      );
      pushFeedback(flagging ? `${user.email} flagged.` : `${user.email} unflagged.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard/admin" className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline">
          ← Admin Tools
        </Link>

        <h1 className="mb-1 text-2xl font-semibold">Manage Accounts</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Search by role, name, email, or business name. Combine role + name for a narrower search.
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, or business name"
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as SearchRole);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          >
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
          </select>
          <label className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => {
                setFlaggedOnly(e.target.checked);
                setPage(1);
              }}
            />
            Flagged only
          </label>
        </div>

        <div className="mb-4 space-y-2">
          {feedback.map((note) => (
            <div
              key={note.id}
              className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {note.text}
            </div>
          ))}
        </div>

        {loading ? (
          <Spinner />
        ) : results.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search.trim() || role || flaggedOnly
              ? "No matching users."
              : "Search for a user by name or filter by role to manage their account."}
          </p>
        ) : (
          <div className="space-y-3">
            {results.map((user) => {
              const isSelf = currentUser?.pk === user.pk;
              const hasStickyNote = Boolean(user.notes?.trim());
              return (
                <div
                  key={user.pk}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}</h2>
                        {user.flagged && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
                            Flagged
                          </span>
                        )}
                        {hasStickyNote && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              🗒 Note
                            </span>
                          )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {user.email} · <span className="capitalize">{user.role}</span>
                        {user.archived && " · Archived"}
                      </p>
                      {hasStickyNote && (
                        <p className="mt-2 max-w-xl rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                          {user.notes.slice(0, 120)}{user.notes.length > 120 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/admin/manage-accounts/${user.pk}`}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                      >
                        Manage
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggleFlagged(user)}
                        disabled={updatingPk === user.pk}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {user.flagged ? "Unflag" : "Flag"}
                      </button>
                      {isSelf ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">You can&apos;t archive or delete your own account.</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleArchived(user)}
                          disabled={updatingPk === user.pk}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                          {user.archived ? "Restore" : "Archive"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onPrevious={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      </div>
    </main>
  );
}
