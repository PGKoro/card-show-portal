"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { useAuth } from "@/lib/AuthContext";
import { ApiError, getApiErrorMessage, apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const PAGE_SIZE = 5;

type Role = "customer" | "vendor" | "admin";

type UserResult = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  archived: boolean;
};

type Feedback = { id: number; text: string };

const ROLES: Role[] = ["customer", "vendor", "admin"];

export default function ManageAccountsPage() {
  const confirm = useConfirm();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
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

      // Search-only: an empty query used to fall through to the backend as
      // `?search=`, which returns every account paginated. Require an
      // actual email fragment before hitting the API at all.
      if (!search.trim()) {
        setResults([]);
        setHasNext(false);
        setHasPrevious(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      apiFetch<PaginatedResponse<UserResult>>(
        `/admin/users/?search=${encodeURIComponent(search)}&page_size=${PAGE_SIZE}&page=${page}`,
        { accessToken: getAccessToken() ?? undefined },
      )
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
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, page]);

  function pushFeedback(text: string) {
    const note: Feedback = { id: nextFeedbackId.current++, text };
    setFeedback((current) => [note, ...current]);
    setTimeout(() => {
      setFeedback((current) => current.filter((item) => item.id !== note.id));
    }, 4000);
  }

  async function handleSetRole(user: UserResult, role: Role) {
    if (role === user.role) return;

    const ok = await confirm({
      title: `Change ${user.email} to ${role}?`,
      message:
        role === "admin"
          ? "They'll get full admin access to this site."
          : role === "vendor"
            ? "They'll need approval before they can list inventory."
            : "They'll lose vendor or admin access.",
      confirmLabel: "Change role",
      tone: role === "admin" ? "danger" : "default",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      const updated = await apiFetch<UserResult>(`/admin/users/${user.pk}/set-role/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { role },
      });
      setResults((current) =>
        current.map((item) => (item.pk === user.pk ? { ...item, role: updated.role } : item)),
      );
      pushFeedback(`${user.email} is now a${role === "admin" ? "n" : ""} ${role}.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  async function handleToggleActive(user: UserResult) {
    const archiving = !user.archived;
    const ok = await confirm({
      title: archiving ? `Archive ${user.email}?` : `Restore ${user.email}?`,
      message: archiving
        ? "They can still log in, but every page will redirect them to a \"contact support\" notice. Their listings and public profile (if a vendor) will be hidden."
        : "They'll regain full access immediately.",
      confirmLabel: archiving ? "Archive" : "Restore",
      tone: archiving ? "danger" : "default",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      const updated = await apiFetch<UserResult>(
        `/admin/users/${user.pk}/${archiving ? "archive" : "restore"}/`,
        { method: "POST", accessToken: getAccessToken() ?? undefined },
      );
      setResults((current) =>
        current.map((item) =>
          item.pk === user.pk ? { ...item, archived: updated.archived } : item,
        ),
      );
      pushFeedback(archiving ? `${user.email} has been archived.` : `${user.email} restored.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not update ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  async function handleDelete(user: UserResult) {
    const ok = await confirm({
      title: `Permanently delete ${user.email}?`,
      message:
        "This can't be undone. Their listings will be deleted too, and any booth registrations will be unlinked.",
      confirmLabel: "Delete account",
      tone: "danger",
    });
    if (!ok) return;

    setUpdatingPk(user.pk);
    try {
      await apiFetch(`/admin/users/${user.pk}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setResults((current) => current.filter((item) => item.pk !== user.pk));
      pushFeedback(`${user.email} has been deleted.`);
    } catch (err) {
      pushFeedback(getApiErrorMessage(err, `Could not delete ${user.email}.`));
    } finally {
      setUpdatingPk(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Manage Accounts</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Search for a user to change their role, archive/restore their account, or delete it.
        </p>

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

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by email..."
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />

        {loading ? (
          <Spinner />
        ) : results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {search.trim() ? "No matching users." : "Search for a user by email to manage their account."}
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {results.map((user) => {
              const isSelf = user.pk === currentUser?.pk;
              const isUpdating = updatingPk === user.pk;
              return (
                <div key={user.pk} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
                        {user.archived && (
                          <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            Archived
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      {ROLES.map((role) => {
                        const isCurrent = role === user.role;
                        return (
                          <button
                            key={role}
                            onClick={() => handleSetRole(user, role)}
                            disabled={isCurrent || isUpdating}
                            className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize disabled:opacity-50 ${
                              isCurrent
                                ? "bg-brand-blue text-white"
                                : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                    {isSelf ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        You can&apos;t archive or delete your own account.
                      </p>
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={isUpdating}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                          {user.archived ? "Restore" : "Archive"}
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          disabled={isUpdating}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </>
                    )}
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
