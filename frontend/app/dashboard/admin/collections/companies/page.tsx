"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Company } from "@/lib/collections";

export default function ManageCompaniesPage() {
  const confirm = useConfirm();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    apiFetch<Company[]>("/admin/collections/companies/", {
      accessToken: getAccessToken() ?? undefined,
    })
      .then(setCompanies)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/admin/collections/companies/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { name: name.trim() },
      });
      setName("");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create this company."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(company: Company) {
    const ok = await confirm({
      title: "Delete this company?",
      message: `"${company.name}" will be permanently deleted. Companies still assigned to a set can't be deleted.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiFetch(`/admin/collections/companies/${company.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this company."));
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin/collections"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Collections
        </Link>
        <h1 className="mb-6 text-2xl font-semibold">Companies</h1>

        <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name (e.g. Panini)"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <Spinner />
        ) : companies.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No companies yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800">
            {companies.map((company) => (
              <li key={company.id} className="flex items-center justify-between p-3">
                <span className="font-medium">{company.name}</span>
                <button
                  onClick={() => handleDelete(company)}
                  className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
