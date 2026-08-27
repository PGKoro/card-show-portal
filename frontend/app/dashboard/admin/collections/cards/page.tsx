"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Spinner } from "@/components/Spinner";
import { apiFetch, apiFetchMultipart, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import type { AdminCard, AdminCardSet, Company } from "@/lib/collections";

function CardForm({
  presetSetId,
  editing,
  onSaved,
  onCancel,
}: {
  presetSetId: string | null;
  editing: AdminCard | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { categories } = useCategories();
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState("");
  const [sets, setSets] = useState<AdminCardSet[]>([]);
  const [setId, setSetId] = useState(presetSetId ?? "");

  const [playerName, setPlayerName] = useState(editing?.player_name ?? "N/A");
  const [team, setTeam] = useState(editing?.team ?? "N/A");
  const [cardNumber, setCardNumber] = useState(editing?.card_number ?? "");
  const [variation, setVariation] = useState(editing?.variation ?? "");
  const [printRun, setPrintRun] = useState(editing?.print_run ? String(editing.print_run) : "");
  const [imageFront, setImageFront] = useState<File | null>(null);
  const [imageBack, setImageBack] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const skipDropdowns = !!presetSetId;

  useEffect(() => {
    if (skipDropdowns || !category) return;
    apiFetch<number[]>(`/collections/years/?category=${category}`).then(setYears);
  }, [category, skipDropdowns]);

  useEffect(() => {
    if (skipDropdowns || !category || !year) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanies([]);
      return;
    }
    apiFetch<Company[]>(`/collections/companies/?category=${category}&year=${year}`).then(setCompanies);
  }, [category, year, skipDropdowns]);

  useEffect(() => {
    if (skipDropdowns || !category || !year || !companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSets([]);
      return;
    }
    apiFetch<PaginatedResponse<AdminCardSet>>(
      `/admin/collections/sets/?category=${category}&year=${year}&company=${companyId}&page_size=100`,
      { accessToken: getAccessToken() ?? undefined },
    ).then((data) => setSets(data.results));
  }, [category, year, companyId, skipDropdowns]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!setId) {
      setError("Choose a set first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("set", setId);
      formData.append("player_name", playerName.trim() || "N/A");
      formData.append("team", team.trim() || "N/A");
      formData.append("card_number", cardNumber.trim());
      formData.append("variation", variation.trim());
      if (printRun.trim()) formData.append("print_run", printRun.trim());
      if (imageFront) formData.append("image_front", imageFront);
      if (imageBack) formData.append("image_back", imageBack);

      await apiFetchMultipart(
        editing ? `/admin/collections/cards/${editing.id}/` : "/admin/collections/cards/",
        formData,
        { method: editing ? "PATCH" : "POST", accessToken: getAccessToken() ?? undefined },
      );
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this card."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 dark:border-gray-800"
    >
      {!skipDropdowns && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setYear("");
                setCompanyId("");
                setSetId("");
              }}
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
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setCompanyId("");
                setSetId("");
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            >
              <option value="">Select a year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Company</label>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setSetId("");
              }}
              disabled={!year}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-transparent"
            >
              <option value="">Select a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Set</label>
            <select
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              disabled={!companyId}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-transparent"
            >
              <option value="">Select a set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">Player / Character</label>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="N/A if not applicable"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Team</label>
        <input
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          placeholder="N/A if not applicable"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Card number</label>
        <input
          required
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Variation / Parallel</label>
        <input
          value={variation}
          onChange={(e) => setVariation(e.target.value)}
          placeholder="Optional, e.g. Blue Ice"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Print run</label>
        <input
          type="number"
          value={printRun}
          onChange={(e) => setPrintRun(e.target.value)}
          placeholder="Optional, e.g. 99"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Front image</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFront(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Back image</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageBack(e.target.files?.[0] ?? null)}
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
          {saving ? "Saving…" : editing ? "Save changes" : "Create card"}
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

export default function ManageCardsPage() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const setFilter = searchParams.get("set");
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const params = new URLSearchParams();
    if (setFilter) params.set("set", setFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("page_size", "50");
    apiFetch<PaginatedResponse<AdminCard>>(`/admin/collections/cards/?${params.toString()}`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => setCards(data.results))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFilter, search]);

  async function handleDelete(card: AdminCard) {
    const ok = await confirm({
      title: "Delete this card?",
      message: `"${card.player_name} #${card.card_number}" will be permanently deleted. Any dealer listings pointing at it will become unlinked, not deleted.`,
      confirmLabel: "Delete card",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiFetch(`/admin/collections/cards/${card.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete this card."));
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
          <h1 className="text-2xl font-semibold">Cards{setFilter ? " in this set" : ""}</h1>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm((v) => !v);
            }}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            {showForm && !editing ? "Close" : "+ New Card"}
          </button>
        </div>

        {showForm && (
          <CardForm
            presetSetId={setFilter}
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
          placeholder="Search by player, card number, or variation..."
          className="mb-6 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
        />

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <Spinner />
        ) : cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No cards found.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">
                    {card.player_name} #{card.card_number}
                    {card.variation ? ` · ${card.variation}` : ""}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {card.set_name} · {card.listing_count} listing{card.listing_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(card);
                      setShowForm(true);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(card)}
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
