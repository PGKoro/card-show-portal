"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { useAuth, type CurrentUser } from "@/lib/AuthContext";
import { dashboardPathForRole, getAccessToken } from "@/lib/auth";
import { CATEGORY_LABELS, type VendorCategory } from "@/lib/mockData";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];

// "Profile Settings" — lets a customer or vendor edit the info they gave
// during onboarding (name, and role-specific details) after the fact.
// Role itself isn't editable here; that stays admin-only (Manage Roles).
export default function ProfileSettingsPage() {
  const { user, setUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryTags, setCategoryTags] = useState<VendorCategory[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // On a full page load, AuthContext resolves `user` asynchronously after
  // this component's first render, so the fields can't be seeded via lazy
  // useState initializers. Sync once, when the user first becomes available
  // — the `initialized` guard means a later setUser() (e.g. after saving)
  // never clobbers whatever the user is currently typing.
  useEffect(() => {
    if (!user || initialized) return;
    const timer = setTimeout(() => {
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setBusinessName(user.business_name ?? "");
      setBusinessDescription(user.business_description ?? "");
      setLocation(user.location ?? "");
      setCategoryTags((user.category_tags as VendorCategory[]) ?? []);
      setInitialized(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [user, initialized]);

  function toggleCategory(category: VendorCategory) {
    setCategoryTags((current) =>
      current.includes(category)
        ? current.filter((tag) => tag !== category)
        : [...current, category],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const updated = await apiFetch<CurrentUser>("/auth/profile/", {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          first_name: firstName,
          last_name: lastName,
          category_tags: categoryTags,
          ...(user?.role === "vendor"
            ? {
                business_name: businessName,
                business_description: businessDescription,
                location,
              }
            : {}),
        },
      });
      setUser(updated);
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save changes. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || !initialized) {
    // Same wrapper as the loaded state below, so there's no layout jump
    // while AuthContext resolves the session and the fields get seeded.
    return (
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div
            role="status"
            aria-label="Loading"
            className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-blue dark:border-gray-700"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href={dashboardPathForRole(user.role)}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Profile Settings</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Update the info you gave us when you signed up.
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

          {user.role === "vendor" && (
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
                <span className="block text-sm font-medium">Categories you sell</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <button
                      type="button"
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        categoryTags.includes(category)
                          ? "border-brand-blue bg-brand-blue text-white"
                          : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {user.role === "customer" && (
            <div>
              <span className="block text-sm font-medium">
                What are you interested in?{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      categoryTags.includes(category)
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {CATEGORY_LABELS[category]}
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
