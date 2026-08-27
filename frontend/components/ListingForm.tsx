"use client";

import { useEffect, useState, type FormEvent } from "react";

import { apiFetch, apiFetchMultipart, getApiErrorMessage, type PaginatedResponse } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import type { CardSetSummary, CardSummary, Company } from "@/lib/collections";
import { GRADE_VALUES, GRADING_LABELS, type GradingCompany } from "@/lib/mockData";

const GRADINGS = Object.keys(GRADING_LABELS) as GradingCompany[];

/**
 * A dealer's "Add Item" listing form. Guides the dealer through the Set
 * Registry (Category -> Year -> Company -> Set -> Card) so identifying
 * fields come from the registry instead of being retyped — the dealer
 * only fills in what's specific to their physical copy (photos, grade,
 * serial number, price/offers/trades). If no matching registry card
 * exists yet, "Can't find your card?" lets them submit it for admin
 * review and continue with the listing unlinked in the meantime.
 */
export function ListingForm({ onCreated }: { onCreated: (title: string) => void }) {
  const { categories } = useCategories();

  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  const [setId, setSetId] = useState("");
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [cardId, setCardId] = useState("");

  const [cantFindCard, setCantFindCard] = useState(false);
  const [submissionSent, setSubmissionSent] = useState(false);
  const [manualPlayerName, setManualPlayerName] = useState("");
  const [manualCardNumber, setManualCardNumber] = useState("");

  const [title, setTitle] = useState("");
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [price, setPrice] = useState("");
  const [acceptingOffers, setAcceptingOffers] = useState(false);
  const [acceptingTrades, setAcceptingTrades] = useState(false);
  const [grading, setGrading] = useState<GradingCompany>("ungraded");
  const [gradingCompanyOther, setGradingCompanyOther] = useState("");
  const [grade, setGrade] = useState(GRADE_VALUES[0]);
  const [isSerialNumbered, setIsSerialNumbered] = useState(false);
  const [serialCopyNumber, setSerialCopyNumber] = useState("");
  const [serialPrintRun, setSerialPrintRun] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!category) return;
    apiFetch<number[]>(`/collections/years/?category=${category}`).then(setYears);
  }, [category]);

  useEffect(() => {
    if (!category || !year) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanies([]);
      return;
    }
    apiFetch<Company[]>(`/collections/companies/?category=${category}&year=${year}`).then(setCompanies);
  }, [category, year]);

  useEffect(() => {
    if (!category || !year || !companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSets([]);
      return;
    }
    apiFetch<PaginatedResponse<CardSetSummary>>(
      `/collections/sets/?category=${category}&year=${year}&company=${companyId}&page_size=100`,
    ).then((data) => setSets(data.results));
  }, [category, year, companyId]);

  useEffect(() => {
    if (!setId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCards([]);
      return;
    }
    apiFetch<PaginatedResponse<CardSummary>>(`/collections/sets/${setId}/cards/?page_size=200`).then(
      (data) => setCards(data.results),
    );
  }, [setId]);

  useEffect(() => {
    const card = cards.find((c) => String(c.id) === cardId) ?? null;
    if (card && !title) {
      const set = sets.find((s) => String(s.id) === setId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(
        [set?.year, set?.company_name, set?.name, card.player_name, `#${card.card_number}`]
          .filter(Boolean)
          .join(" "),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  async function handleSubmitCardRequest() {
    if (!setId || !manualCardNumber.trim()) {
      setError("Choose a set and enter a card number before submitting.");
      return;
    }
    try {
      await apiFetch("/collections/submissions/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: {
          set: Number(setId),
          player_name: manualPlayerName.trim() || "N/A",
          card_number: manualCardNumber.trim(),
        },
      });
      setSubmissionSent(true);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit this card for review."));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("category", category);
      if (cardId) formData.append("card", cardId);
      if (frontImage) formData.append("front_image", frontImage);
      if (backImage) formData.append("back_image", backImage);
      if (price.trim()) formData.append("price", price.trim());
      formData.append("accepting_offers", String(acceptingOffers));
      formData.append("accepting_trades", String(acceptingTrades));
      formData.append("grading", grading);
      if (grading === "other") formData.append("grading_company_other", gradingCompanyOther.trim());
      if (grading !== "ungraded") formData.append("grade", grade);
      formData.append("is_serial_numbered", String(isSerialNumbered));
      if (isSerialNumbered) {
        formData.append("serial_copy_number", serialCopyNumber);
        formData.append("serial_print_run", serialPrintRun);
      }
      formData.append("description", description);

      const created = await apiFetchMultipart<{ title: string }>("/listings/", formData, {
        accessToken: getAccessToken() ?? undefined,
      });
      onCreated(created.title);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not add item. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 dark:border-gray-800"
    >
      <div className="sm:col-span-2">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Find your card in the registry
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Selecting a registry card fills in the identifying details automatically.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setYear("");
            setCompanyId("");
            setSetId("");
            setCardId("");
          }}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Year</label>
        <select
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setCompanyId("");
            setSetId("");
            setCardId("");
          }}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
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
        <label className="block text-sm font-medium">Company</label>
        <select
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setSetId("");
            setCardId("");
          }}
          disabled={!year}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent"
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
        <label className="block text-sm font-medium">Set</label>
        <select
          value={setId}
          onChange={(e) => {
            setSetId(e.target.value);
            setCardId("");
          }}
          disabled={!companyId}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent"
        >
          <option value="">Select a set</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">Card</label>
        <select
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          disabled={!setId}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent"
        >
          <option value="">Select a card</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.card_number} {c.player_name}
              {c.variation ? ` (${c.variation})` : ""}
            </option>
          ))}
        </select>
        {setId && (
          <button
            type="button"
            onClick={() => setCantFindCard((v) => !v)}
            className="mt-1 text-xs font-medium text-brand-blue hover:underline"
          >
            Can&apos;t find your card?
          </button>
        )}
      </div>

      {cantFindCard && (
        <div className="sm:col-span-2 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700">
          {submissionSent ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              Submitted for admin review. You can still finish creating this listing below — it will
              connect to the registry automatically once approved.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Submit this card for admin review. You can still finish your listing now.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={manualPlayerName}
                  onChange={(e) => setManualPlayerName(e.target.value)}
                  placeholder="Player / character (or N/A)"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                />
                <input
                  value={manualCardNumber}
                  onChange={(e) => setManualCardNumber(e.target.value)}
                  placeholder="Card number"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                />
              </div>
              <button
                type="button"
                onClick={handleSubmitCardRequest}
                className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                Submit for review
              </button>
            </>
          )}
        </div>
      )}

      <div className="sm:col-span-2">
        <label htmlFor="title" className="block text-sm font-medium">
          Full title
        </label>
        <input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 2020 Prizm Jalen Hurts Blue Ice Prizm Rookie #/99 - PSA 9"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Front photo</label>
        <input
          required
          type="file"
          accept="image/*"
          onChange={(e) => setFrontImage(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Back photo</label>
        <input
          required
          type="file"
          accept="image/*"
          onChange={(e) => setBackImage(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </div>

      <div>
        <label htmlFor="grading" className="block text-sm font-medium">
          Graded?
        </label>
        <select
          id="grading"
          value={grading}
          onChange={(e) => setGrading(e.target.value as GradingCompany)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        >
          {GRADINGS.map((g) => (
            <option key={g} value={g}>
              {GRADING_LABELS[g]}
            </option>
          ))}
        </select>
      </div>

      {grading === "other" && (
        <div>
          <label className="block text-sm font-medium">Grading company name</label>
          <input
            value={gradingCompanyOther}
            onChange={(e) => setGradingCompanyOther(e.target.value)}
            placeholder="e.g. HGA"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>
      )}

      {grading !== "ungraded" && (
        <div>
          <label htmlFor="grade" className="block text-sm font-medium">
            Grade
          </label>
          <select
            id="grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          >
            {GRADE_VALUES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="serial"
          type="checkbox"
          checked={isSerialNumbered}
          onChange={(e) => setIsSerialNumbered(e.target.checked)}
        />
        <label htmlFor="serial" className="text-sm font-medium">
          Serial numbered?
        </label>
      </div>
      {isSerialNumbered && (
        <>
          <div>
            <label className="block text-sm font-medium">Copy number</label>
            <input
              type="number"
              min="1"
              value={serialCopyNumber}
              onChange={(e) => setSerialCopyNumber(e.target.value)}
              placeholder="e.g. 57"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Print run</label>
            <input
              type="number"
              min="1"
              value={serialPrintRun}
              onChange={(e) => setSerialPrintRun(e.target.value)}
              placeholder="e.g. 99"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="price" className="block text-sm font-medium">
          Price ($)
        </label>
        <input
          id="price"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Optional if accepting offers/trades"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={acceptingOffers}
            onChange={(e) => setAcceptingOffers(e.target.checked)}
          />
          Accepting offers
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={acceptingTrades}
            onChange={(e) => setAcceptingTrades(e.target.checked)}
          />
          Accepting trades
        </label>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
        />
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Item"}
        </button>
      </div>
    </form>
  );
}
