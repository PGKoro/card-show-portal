"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type GlobalNoteEntry = {
  id: number;
  target_type: "user" | "event";
  target_id: number;
  target_label: string | null;
  admin: string | null;
  note: string;
  created_at: string;
};

type TypeFilter = "" | "user" | "event";

export default function AdminNoteHistoryPage() {
  const [entries, setEntries] = useState<GlobalNoteEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adminInput, setAdminInput] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");

  // Debounce the admin search box so we're not firing a request on every
  // keystroke — same pattern as Manage Accounts' search field.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAdminQuery(adminInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [adminInput]);

  useEffect(() => {
    let cancelled = false;

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
        if (cancelled) return;
        setEntries(data.results);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
      } catch {
        if (cancelled) return;
        setEntries([]);
        setHasNext(false);
        setHasPrevious(false);
        setError("Could not load note history. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [page, adminQuery, typeFilter]);

  function targetHref(entry: GlobalNoteEntry): string {
    return entry.target_type === "event"
      ? `/dashboard/admin/events/${entry.target_id}`
      : `/dashboard/admin/manage-accounts/${entry.target_id}`;
  }

  const isFiltered = Boolean(adminQuery || typeFilter);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {entries.map((entry) => (
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
                      <td className="max-w-sm px-4 py-3 whitespace-pre-wrap break-words">{entry.note}</td>
                    </tr>
                  ))}
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
