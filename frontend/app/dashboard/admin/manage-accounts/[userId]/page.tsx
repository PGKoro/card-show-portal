"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getAccessToken, stashAdminTokens } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { PROFILE_THEME_OPTIONS } from "@/lib/profileThemes";

type Role = "customer" | "vendor" | "admin";

type AccountDetail = {
  pk: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  business_name: string;
  business_description: string;
  location: string;
  category_tags: string[];
  instagram_url: string;
  youtube_url: string;
  x_url: string;
  website_url: string;
  profile_theme: string;
  tagline: string;
  collection_size: number | null;
  selling_since_year: number | null;
  also_buying: boolean;
  payment_methods: string[];
  vendor_status: "pending_review" | "approved" | "rejected" | null;
  archived: boolean;
  notes: string;
  note_count: number;
  date_joined: string;
};

type NoteLogEntry = {
  id: number;
  account: string | null;
  admin: string | null;
  note: string;
  created_at: string;
};

type PaginatedNoteResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: NoteLogEntry[];
};

const ROLE_OPTIONS: Role[] = ["customer", "vendor", "admin"];

export default function ManageAccountDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const { login } = useAuth();
  const { categories } = useCategories();

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryTags, setCategoryTags] = useState<string[]>([]);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [profileTheme, setProfileTheme] = useState("blue");
  const [tagline, setTagline] = useState("");
  const [collectionSize, setCollectionSize] = useState("");
  const [sellingSinceYear, setSellingSinceYear] = useState("");
  const [alsoBuying, setAlsoBuying] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [noteHistory, setNoteHistory] = useState<NoteLogEntry[]>([]);
  const [notePage, setNotePage] = useState(1);
  const [noteReloadKey, setNoteReloadKey] = useState(0);
  const [noteHasNext, setNoteHasNext] = useState(false);
  const [noteHasPrevious, setNoteHasPrevious] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteDeletingId, setNoteDeletingId] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const data = await apiFetch<PaginatedNoteResponse>(
          `/admin/users/${userId}/history/?page=${notePage}&page_size=5`,
          { accessToken: getAccessToken() ?? undefined },
        );
        if (cancelled) return;
        setNoteHistory(data.results);
        setNoteHasNext(Boolean(data.next));
        setNoteHasPrevious(Boolean(data.previous));
      } catch {
        if (cancelled) return;
        setNoteHistory([]);
        setNoteHasNext(false);
        setNoteHasPrevious(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [userId, notePage, noteReloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        const data = await apiFetch<AccountDetail>(`/admin/users/${userId}/`, {
          accessToken: getAccessToken() ?? undefined,
        });
        if (cancelled) return;
        setAccount(data);
        setEmail(data.email);
        setRole(data.role);
        setFirstName(data.first_name);
        setLastName(data.last_name);
        setBusinessName(data.business_name);
        setBusinessDescription(data.business_description);
        setLocation(data.location);
        setCategoryTags(data.category_tags);
        setInstagramUrl(data.instagram_url);
        setYoutubeUrl(data.youtube_url);
        setXUrl(data.x_url);
        setWebsiteUrl(data.website_url);
        setProfileTheme(data.profile_theme ?? "blue");
        setTagline(data.tagline ?? "");
        setCollectionSize(data.collection_size ? String(data.collection_size) : "");
        setSellingSinceYear(data.selling_since_year ? String(data.selling_since_year) : "");
        setAlsoBuying(data.also_buying ?? false);
        setPaymentMethods(data.payment_methods ?? []);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function postNote(event: FormEvent) {
    event.preventDefault();
    if (!draftNote.trim()) return;
    setNoteSubmitting(true);
    setError(null);
    try {
      const noteText = draftNote.trim();
      await apiFetch<NoteLogEntry>(`/admin/users/${userId}/history/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { note: noteText },
      });
      setDraftNote("");
      setNotePage(1);
      setNoteReloadKey((value) => value + 1);
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not add note. Please try again."));
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function deleteNote(noteId: number) {
    setNoteDeletingId(noteId);
    setError(null);
    try {
      await apiFetch(`/admin/users/${userId}/history/${noteId}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setNotePage(1);
      setNoteReloadKey((value) => value + 1);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete note. Please try again."));
    } finally {
      setNoteDeletingId(null);
    }
  }

  async function impersonateUser() {
    if (!account) return;
    setImpersonating(true);
    setError(null);
    try {
      const response = await apiFetch<{ access: string; refresh: string }>(
        `/admin/users/${userId}/impersonate/`,
        { method: "POST", accessToken: getAccessToken() ?? undefined },
      );
      stashAdminTokens();
      const impersonatedUser = await login({ access: response.access, refresh: response.refresh });
      router.push(`/dashboard/${impersonatedUser.role}`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not start impersonation. Please try again."));
      setImpersonating(false);
    }
  }

  function toggleCategory(category: string) {
    setCategoryTags((current) =>
      current.includes(category) ? current.filter((tag) => tag !== category) : [...current, category],
    );
  }

  function togglePaymentMethod(method: string) {
    setPaymentMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method],
    );
  }

  async function saveMainDetails(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const updated = await apiFetch<AccountDetail>(`/admin/users/${userId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          email,
          role,
          first_name: firstName,
          last_name: lastName,
          category_tags: categoryTags,
          ...(account?.role === "vendor"
            ? {
                business_name: businessName,
                business_description: businessDescription,
                location,
                instagram_url: instagramUrl,
                youtube_url: youtubeUrl,
                x_url: xUrl,
                website_url: websiteUrl,
                profile_theme: profileTheme,
                tagline,
                collection_size: collectionSize ? Number(collectionSize) : null,
                selling_since_year: sellingSinceYear ? Number(sellingSinceYear) : null,
                also_buying: alsoBuying,
                payment_methods: paymentMethods,
              }
            : {}),
        },
      });
      setAccount(updated);
      setEmail(updated.email);
      setRole(updated.role);
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save changes. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRole() {
    if (!account || role === account.role) return;
    setRoleSubmitting(true);
    setError(null);
    try {
      const updated = await apiFetch<AccountDetail>(`/admin/users/${userId}/set-role/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { role },
      });
      setAccount(updated);
      setRole(updated.role);
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not update role. Please try again."));
    } finally {
      setRoleSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <Spinner />
        </div>
      </main>
    );
  }

  if (notFound || !account) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Account not found</h1>
        <Link href="/dashboard/admin/manage-accounts" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to Manage Accounts
        </Link>
      </main>
    );
  }

  const noteCount = account.note_count ?? 0;

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard/admin/manage-accounts" className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline">
          ← Manage Accounts
        </Link>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold">
                {[account.first_name, account.last_name].filter(Boolean).join(" ") || account.email}
              </h1>
              {account.role !== "admin" && (
                <button
                  type="button"
                  onClick={impersonateUser}
                  disabled={impersonating}
                  className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                >
                  {impersonating ? "Starting…" : "Impersonate"}
                </button>
              )}
            </div>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              {account.email} · <span className="capitalize">{account.role}</span>
              {account.archived && " · Archived"}
              {noteCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  🗒 {noteCount}
                </span>
              )}
            </p>

            {success && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                Saved.
              </div>
            )}

            <form onSubmit={saveMainDetails} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="role" className="block text-sm font-medium">
                    Role
                  </label>
                  <div className="mt-1 flex gap-2">
                    <select
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={saveRole}
                      disabled={roleSubmitting || role === account.role}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                    >
                      {roleSubmitting ? "Saving…" : "Change role"}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium">
                    First name
                  </label>
                  <input
                    id="firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium">
                    Last name
                  </label>
                  <input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
              </div>

              {account.role === "vendor" && (
                <div className="space-y-4 rounded-md border border-gray-200 p-4 dark:border-gray-800">
                  <div>
                    <label htmlFor="businessName" className="block text-sm font-medium">
                      Business name
                    </label>
                    <input
                      id="businessName"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="businessDescription" className="block text-sm font-medium">
                      Description
                    </label>
                    <textarea
                      id="businessDescription"
                      rows={3}
                      value={businessDescription}
                      onChange={(e) => setBusinessDescription(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="location" className="block text-sm font-medium">
                      Location
                    </label>
                    <input
                      id="location"
                      placeholder="City, State"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                  <div>
                    <span className="block text-sm font-medium">Categories they sell</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {categories.map((category) => (
                        <button
                          type="button"
                          key={category.slug}
                          onClick={() => toggleCategory(category.slug)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${categoryTags.includes(category.slug) ? "border-brand-blue bg-brand-blue text-white" : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                    <span className="block text-sm font-medium">
                      Social links <span className="font-normal text-gray-400">(optional)</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Instagram (e.g. instagram.com/yourshop)"
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                    <input
                      type="text"
                      placeholder="YouTube"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                    <input
                      type="text"
                      placeholder="X (Twitter)"
                      value={xUrl}
                      onChange={(e) => setXUrl(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                    <input
                      type="text"
                      placeholder="Website"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                  <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                    <span className="block text-sm font-medium">
                      Additional details <span className="font-normal text-gray-400">(optional)</span>
                    </span>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="Short tagline (e.g. Vintage cards, fair prices)"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        min={0}
                        placeholder="Approx. cards in collection"
                        value={collectionSize}
                        onChange={(e) => setCollectionSize(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      <input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear()}
                        placeholder="Selling/collecting since (year)"
                        value={sellingSinceYear}
                        onChange={(e) => setSellingSinceYear(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={alsoBuying}
                        onChange={(e) => setAlsoBuying(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Also buying, not just selling
                    </label>
                    <div>
                      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Payment methods accepted at their booth
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {PAYMENT_METHOD_OPTIONS.map((method) => (
                          <button
                            type="button"
                            key={method.value}
                            onClick={() => togglePaymentMethod(method.value)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${paymentMethods.includes(method.value) ? "border-brand-blue bg-brand-blue text-white" : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}
                          >
                            {method.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                    <span className="block text-sm font-medium">Profile color</span>
                    <div className="mt-2 flex gap-2">
                      {PROFILE_THEME_OPTIONS.map((theme) => (
                        <button
                          type="button"
                          key={theme.value}
                          onClick={() => setProfileTheme(theme.value)}
                          title={theme.label}
                          aria-label={theme.label}
                          className={`h-8 w-8 rounded-full ${theme.swatchClassName} ${profileTheme === theme.value ? "ring-2 ring-offset-2 ring-brand-blue dark:ring-offset-gray-950" : ""}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {account.role === "customer" && (
                <div>
                  <span className="block text-sm font-medium">
                    Interested categories <span className="font-normal text-gray-400">(optional)</span>
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <button
                        type="button"
                        key={category.slug}
                        onClick={() => toggleCategory(category.slug)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${categoryTags.includes(category.slug) ? "border-brand-blue bg-brand-blue text-white" : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Post a note
                </h2>
                <span className="text-xs text-gray-400">{noteCount} total</span>
              </div>
              <form onSubmit={postNote} className="mt-3 space-y-3">
                <textarea
                  rows={4}
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Write an internal admin note..."
                  className="w-full rounded-md border border-blue-300 px-3 py-2 dark:border-blue-700 dark:bg-transparent"
                />
                <button
                  type="submit"
                  disabled={noteSubmitting || !draftNote.trim()}
                  className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                >
                  {noteSubmitting ? "Posting…" : "Post note"}
                </button>
              </form>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Posted notes
                </h2>
                <span className="text-xs text-gray-400">{noteHistory.length} entries</span>
              </div>

              {noteHistory.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No notes posted yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {noteHistory.map((entry) => (
                    <article key={entry.id} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <div className="font-medium text-gray-700 dark:text-gray-200">
                            {entry.admin ?? "Unknown admin"}
                          </div>
                          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteNote(entry.id)}
                          disabled={noteDeletingId === entry.id}
                          className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          {noteDeletingId === entry.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{entry.note}</p>
                    </article>
                  ))}
                </div>
              )}

              <Pagination
                page={notePage}
                hasNext={noteHasNext}
                hasPrevious={noteHasPrevious}
                onPrevious={() => setNotePage((current) => Math.max(1, current - 1))}
                onNext={() => setNotePage((current) => current + 1)}
              />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
