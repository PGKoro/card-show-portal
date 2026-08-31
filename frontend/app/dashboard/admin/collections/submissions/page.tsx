"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { AdminCardSubmission } from "@/lib/collections";

export default function ManageCardSubmissionsPage() {
  const [submissions, setSubmissions] = useState<AdminCardSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "" | "approved" | "rejected">("pending");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function refresh() {
    apiFetch<AdminCardSubmission[]>(
      `/admin/collections/submissions/?status=${statusFilter}`,
      { accessToken: getAccessToken() ?? undefined },
    )
      .then(setSubmissions)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleAction(submission: AdminCardSubmission, action: "approve" | "reject") {
    setBusyId(submission.id);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/admin/collections/submissions/${submission.id}/${action}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      setSuccess(action === "approve" ? "Card approved and added to the registry." : "Submission rejected.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not update this submission."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/admin/collections"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Collections
        </Link>
        <h1 className="mb-6 text-2xl font-semibold">Card Submissions</h1>

        <div className="mb-6 flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", ""] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                statusFilter === s
                  ? "bg-brand-navy text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="mb-4 text-sm text-green-700 dark:text-green-400">{success}</p>}

        {loading ? (
          <Spinner />
        ) : submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No submissions found.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800">
            {submissions.map((submission) => (
              <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">
                    {submission.player_name} #{submission.card_number}
                    {submission.variation ? ` · ${submission.variation}` : ""}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {submission.set_name} · Submitted by {submission.submitted_by_name || "Unknown"}
                  </p>
                  {submission.notes && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{submission.notes}</p>
                  )}
                </div>
                {submission.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === submission.id}
                      onClick={() => handleAction(submission, "approve")}
                      className="rounded-md border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === submission.id}
                      onClick={() => handleAction(submission, "reject")}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      submission.status === "approved"
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {submission.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
