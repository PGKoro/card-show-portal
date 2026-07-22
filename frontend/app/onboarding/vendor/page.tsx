"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { useAuth, type CurrentUser } from "@/lib/AuthContext";
import { dashboardPathForRole, getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";

// Onboarding step 2 for vendors: business details, then pending admin
// approval. Step 1 (name + role) already happened on /onboarding.
export default function VendorOnboardingPage() {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const { categories } = useCategories();
  const checkedRef = useRef(false);

  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryTags, setCategoryTags] = useState<string[]>([]);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // See the matching comment in app/onboarding/page.tsx — setUser(updated)
  // below would otherwise make this page's own guard swap it to a tiny
  // spinner while router.push's navigation is still in flight.
  const [navigatingAway, setNavigatingAway] = useState(false);

  useEffect(() => {
    if (isLoading || checkedRef.current) return;
    checkedRef.current = true;
    if (!user) {
      router.replace("/login");
    } else if (user.onboarding_completed) {
      router.replace(dashboardPathForRole(user.role));
    } else if (!user.first_name) {
      router.replace("/onboarding");
    } else if (user.role !== "vendor") {
      router.replace(`/onboarding/${user.role}`);
    }
  }, [isLoading, user, router]);

  function toggleCategory(category: string) {
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

    try {
      const updated = await apiFetch<CurrentUser>("/auth/onboarding/details/", {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          business_name: businessName,
          business_description: businessDescription,
          location,
          category_tags: categoryTags,
          instagram_url: instagramUrl,
          youtube_url: youtubeUrl,
          x_url: xUrl,
          website_url: websiteUrl,
        },
      });
      setUser(updated);
      setNavigatingAway(true);
      router.push(dashboardPathForRole(updated.role));
    } catch (err) {
      setError(getApiErrorMessage(err, "Something went wrong. Please try again."));
      setSubmitting(false);
    }
  }

  if (isLoading || !user) {
    return <AuthPageSpinner />;
  }
  if (
    !navigatingAway &&
    (user.onboarding_completed || !user.first_name || user.role !== "vendor")
  ) {
    return <AuthPageSpinner />;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Link href="/" className="text-2xl font-bold tracking-tight text-brand-navy">
          Collectors Village
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/perfect-game-navy.png" alt="Perfect Game" className="h-4 w-auto" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Tell us about your business, {user.first_name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Vendor accounts need admin approval before you can list inventory. You can fill this
            out now and start browsing while you wait.
          </p>
        </div>

        <div>
          <label htmlFor="businessName" className="block text-sm font-medium">
            Business name
          </label>
          <input
            id="businessName"
            type="text"
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
            type="text"
            placeholder="City, State"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>

        <div>
          <span className="block text-sm font-medium">Categories you sell</span>
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

        <div className="space-y-3 rounded-md border border-gray-200 p-4 dark:border-gray-800">
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Finish setting up"}
        </button>
      </form>
    </main>
  );
}
