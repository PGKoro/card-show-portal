"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { CATEGORY_LABELS, type VendorCategory } from "@/lib/mockData";

type VendorDetail = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  business_description: string;
  location: string;
  category_tags: VendorCategory[];
  vendor_status: "pending_review" | "approved" | "rejected" | null;
  date_joined: string;
};

export default function VendorApprovalDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const router = useRouter();
  const confirm = useConfirm();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<VendorDetail>(`/admin/users/${vendorId}/`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        if (!cancelled) setVendor(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, "Could not load this vendor."));
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  async function handleDecision(decision: "approve" | "reject") {
    const ok = await confirm({
      title: decision === "approve" ? "Approve this vendor?" : "Reject this vendor?",
      message:
        decision === "approve"
          ? `${vendor?.business_name} will be able to list inventory immediately.`
          : `${vendor?.business_name} will not be able to list inventory.`,
      confirmLabel: decision === "approve" ? "Approve" : "Reject",
      tone: decision === "approve" ? "default" : "danger",
    });
    if (!ok) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/admin/vendors/${vendorId}/${decision}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      router.push("/dashboard/admin/vendor-approvals");
    } catch (err) {
      setError(getApiErrorMessage(err, `Could not ${decision} this vendor.`));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin/vendor-approvals"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Vendor Approvals
        </Link>

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {!vendor ? (
          <div
            role="status"
            aria-label="Loading"
            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-blue dark:border-gray-700"
          />
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold">{vendor.business_name}</h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Submitted {new Date(vendor.date_joined).toLocaleDateString()}
            </p>

            <dl className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800">
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Contact name
                </dt>
                <dd className="text-sm">
                  {[vendor.first_name, vendor.last_name].filter(Boolean).join(" ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Email
                </dt>
                <dd className="text-sm">{vendor.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Business description
                </dt>
                <dd className="text-sm">{vendor.business_description || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Location
                </dt>
                <dd className="text-sm">{vendor.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Categories
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {vendor.category_tags.length === 0 ? (
                    <span className="text-sm">—</span>
                  ) : (
                    vendor.category_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {CATEGORY_LABELS[tag]}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            </dl>

            {vendor.vendor_status === "pending_review" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecision("approve")}
                  disabled={submitting}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision("reject")}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Reject
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Already {vendor.vendor_status === "approved" ? "approved" : "reviewed"}.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
