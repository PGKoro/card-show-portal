"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";

type GlobalNoteEntry = {
  id: number;
  target_type: "user" | "event";
  target_id: number;
  target_label: string | null;
  admin: string | null;
  author_id: number | null;
  note: string;
  created_at: string;
};

type TypeFilter = "" | "user" | "event";

export default function AdminNoteHistoryPage() {
  const { user: currentUser } = useAuth();
  const viewerIsOwner = currentUser?.role === "owner";
  const [entries, setEntries] = useState<GlobalNoteEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [adminInput, setAdminInput] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Debounce the admin search box so we're not firing a request on every
  // keystroke — same pattern as Manage Accounts' search field.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAdminQuery(adminInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [adminInput]);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (adminQuery) params.set("admin", adminQuery);
      if (typeFilter) params.set("type", typeFilter);

      const data = await apiFetch<PaginatedResponse<GlobalNoteEntry>>(
        `/admin/notes/history/?${params.toString()}`,
        { accessToken: getAccessToken() ?? undefined },
      );
      setEntries(data.results);
      setHasNext(Boolean(data.next));
      setHasPrevious(Boolean(data.previous));
    } catch {
      setEntries([]);
      setHasNext(false);
      setHasPrevious(false);
      setError("Could not load note history. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadHistory();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, adminQuery, typeFilter]);

  function startEditing(entry: GlobalNoteEntry) {
    setActionError(null);
    setEditingId(entry.id);
    setEditingText(entry.note);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingText("");
  }

  async function submitEdit(noteId: number) {
    if (!editingText.trim()) return;
    setEditSubmitting(true);
    setActionError(null);
    try {
      await apiFetch(`/admin/notes/history/${noteId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { note: editingText.trim() },
      });
      setEditingId(null);
      setEditingText("");
      await loadHistory();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not update note. Please try again."));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function deleteNote(noteId: number) {
    setDeletingId(noteId);
    setActionError(null);
    try {
      await apiFetch(`/admin/notes/history/${noteId}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      await loadHistory();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not delete note. Please try again."));
    } finally {
      setDeletingId(null);
    }
  }

  function targetHref(entry: GlobalNoteEntry): string {
    return entry.target_type === "event"
      ? `/dashboard/admin/events/${entry.target_id}`
      : `/dashboard/admin/manage-accounts/${entry.target_id}`;
  }

  const isFiltered = Boolean(adminQuery || typeFilter);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Admin Note History</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Every note added or removed on any account or event, newest first.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <input
            type="text"
            value={adminInput}
            onChange={(e) => setAdminInput(e.target.value)}
            placeholder="Search by admin name or email..."
            className="flex-1 min-w-[220px] rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeFilter);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          >
            <option value="">All types</option>
            <option value="user">Account notes</option>
            <option value="event">Event notes</option>
          </select>
        </div>

        {actionError && (
          <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {actionError}
          </p>
        )}

        {loading ? (
          <Spinner />
        ) : error ? (
          <p className="rounded-lg border border-dashed border-red-300 p-8 text-center text-red-600 dark:border-red-800 dark:text-red-400">
            {error}
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {isFiltered ? "No notes match your search." : "No notes have been posted yet."}
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date &amp; time</th>
                    <th className="px-4 py-2.5 font-medium">Admin</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">On</th>
                    <th className="px-4 py-2.5 font-medium">Note</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {entries.map((entry) => {
                    const canManageThisNote = viewerIsOwner || entry.author_id === currentUser?.pk;
                    const isEditing = editingId === entry.id;
                    return (
                      <tr key={entry.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                          {new Date(entry.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">{entry.admin ?? "—"}</td>
                        <td className="px-4 py-3 capitalize text-gray-500 dark:text-gray-400">
                          {entry.target_type}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={targetHref(entry)} className="text-blue-600 hover:underline dark:text-blue-400">
                            {entry.target_label ?? "—"}
                          </Link>
                        </td>
                        <td className="max-w-sm px-4 py-3 whitespace-pre-wrap break-words">
                          {isEditing ? (
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={3}
                              className="w-full min-w-[220px] rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                          ) : (
                            entry.note
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!canManageThisNote ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : isEditing ? (
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => submitEdit(entry.id)}
                                disabled={editSubmitting || !editingText.trim()}
                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {editSubmitting ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditing}
                                disabled={editSubmitting}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => startEditing(entry)}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteNote(entry.id)}
                                disabled={deletingId === entry.id}
                                className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                              >
                                {deletingId === entry.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        )}
      </div>
    </main>
  );
}
