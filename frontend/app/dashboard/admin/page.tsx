"use client";

import { useRef, useState } from "react";

import { CATEGORY_LABELS, PENDING_VENDOR_APPROVALS, type PendingVendorApproval } from "@/lib/mockData";

type Feedback = { id: number; text: string };

export default function AdminDashboardPage() {
  const [pending, setPending] = useState<PendingVendorApproval[]>(PENDING_VENDOR_APPROVALS);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextFeedbackId = useRef(0);

  function handleDecision(approval: PendingVendorApproval, decision: "approved" | "rejected") {
    setPending((current) => current.filter((item) => item.id !== approval.id));

    const note: Feedback = {
      id: nextFeedbackId.current++,
      text: `${approval.businessName} ${decision === "approved" ? "approved ✓" : "rejected ✕"} (demo only — no account was actually changed).`,
    };
    setFeedback((current) => [note, ...current]);
    setTimeout(() => {
      setFeedback((current) => current.filter((item) => item.id !== note.id));
    }, 4000);
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-2xl font-semibold">Pending Vendor Approvals</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          New vendor signups waiting for review before they can list inventory.
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

        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No pending approvals right now.
          </p>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {pending.map((approval) => (
              <div key={approval.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{approval.businessName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{approval.contactEmail}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {approval.categoryTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {CATEGORY_LABELS[tag]}
                      </span>
                    ))}
                    <span className="text-xs text-gray-400">Submitted {approval.submittedDate}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDecision(approval, "approved")}
                    className="rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(approval, "rejected")}
                    className="rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
