"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Spinner } from "@/components/Spinner";
import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
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
  date_joined: string;
};

// Lets an admin edit another account's name and role-specific details
// directly (the "Manage" action in Manage Accounts) — same fields as that
// user's own Profile Settings, just admin-driven. Role, email, vendor
// approval status, and archived state stay untouched here; those have
// their own dedicated actions (role buttons, archive/restore, delete) back
// on the Manage Accounts list.
export default function ManageAccountDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { categories } = useCategories();

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    apiFetch<AccountDetail>(`/admin/users/${userId}/`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setAccount(data);
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
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggleCategory(category: string) {
    setCategoryTags((current) =>
      current.includes(category)
        ? current.filter((tag) => tag !== category)
        : [...current, category],
    );
  }

  function togglePaymentMethod(method: string) {
    setPaymentMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const updated = await apiFetch<AccountDetail>(`/admin/users/${userId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
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
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save changes. Please try again."));
    } finally {
      setSubmitting(false);
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
        <Link
          href="/dashboard/admin/manage-accounts"
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          &larr; Back to Manage Accounts
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin/manage-accounts"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Accounts
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">
          {[account.first_name, account.last_name].filter(Boolean).join(" ") || account.email}
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {account.email} · <span className="capitalize">{account.role}</span>
          {account.archived && " · Archived"}
        </p>

        {success && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            Saved.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        categoryTags.includes(category.slug)
                          ? "border-brand-blue bg-brand-blue text-white"
                          : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                      }`}
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
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          paymentMethods.includes(method.value)
                            ? "border-brand-blue bg-brand-blue text-white"
                            : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        }`}
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
                      className={`h-8 w-8 rounded-full ${theme.swatchClassName} ${
                        profileTheme === theme.value
                          ? "ring-2 ring-offset-2 ring-brand-blue dark:ring-offset-gray-950"
                          : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {account.role === "customer" && (
            <div>
              <span className="block text-sm font-medium">
                Interested categories{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category.slug}
                    onClick={() => toggleCategory(category.slug)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      categoryTags.includes(category.slug)
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
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
      </div>
    </main>
  );
}
