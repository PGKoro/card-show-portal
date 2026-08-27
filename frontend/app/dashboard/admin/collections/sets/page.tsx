"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Spinner } from "@/components/Spinner";
import { apiFetch, apiFetchMultipart, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import type { AdminCardSet, Company } from "@/lib/collections";

function SetForm({
  companies,
  editing,
  onSaved,
  onCancel,
}: {
  companies: Company[];
  editing: AdminCardSet | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { categories } = useCategories();
  const [name, setName] = useState(editing?.name ?? "");
  const [year, setYear] = useState(String(editing?.year ?? new Date().getFullYear()));
  const [company, setCompany] = useState(String(editing?.company ?? companies[0]?.id ?? ""));
  const [category, setCategory] = useState(editing?.category ?? categories[0]?.slug ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("year", year);
      formData.append("company", company);
      formData.append("category", category);
      if (imageFile) formData.append("image", imageFile);

      await apiFetchMultipart(
        editing ? `/admin/collections/sets/${editing.id}/` : "/admin/collections/sets/",
        formData,
        { method: editing ? "PATCH" : "POST", accessToken: getAccessToken() ?? undefined },
      );
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this set."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 dark:border-gray-800"
    >
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium">Set name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Prizm"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Year</label>
        <input
          required
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Company</label>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Image (optional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create set"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ManageSetsPage() {
  const confirm = useConfirm();
  const { labelFor } = useCategories();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sets, setSets] = useState<AdminCardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminCardSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    params.set("page_size", "50");
    apiFetch<PaginatedResponse<AdminCardSet>>(`/admin/collections/sets/?${params.toString()}`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => setSets(data.results))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    apiFetch<Company[]>("/admin/collections/companies/", { accessToken: getAccessToken() ?? undefined }).then(
      setCompanies,
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(set: AdminCardSet) {
    const ok = await confirm({
      title: "Delete this set?",
      message: `"${set.year} ${set.company_name} ${set.name}" and every card inside it will be deleted. Any dealer listings pointing at those cards will just become unlinked, not deleted.`,
      confirmLabel: "Delete set",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiFetch(`/admin/collections/sets/${set.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this set."));
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/admin/collections"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Collections
        </Link>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Sets</h1>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm((v) => !v);
            }}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            {showForm && !editing ? "Close" : "+ New Set"}
          </button>
        </div>

        {showForm && (
          <SetForm
            companies={companies}
            editing={editing}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSaved={() => {
              setShowForm(false);
              setEditing(null);
              refresh();
            }}
          />
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sets by name or company..."
          className="mb-6 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <Spinner />
        ) : sets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No sets found.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800">
            {sets.map((set) => (
              <li key={set.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">
                    {set.year} {set.company_name} {set.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {labelFor(set.category)} · {set.card_count} card{set.card_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/admin/collections/cards?set=${set.id}`}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    View cards
                  </Link>
                  <button
                    onClick={() => {
                      setEditing(set);
                      setShowForm(true);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(set)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
