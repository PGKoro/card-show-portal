"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { useAuth, type CurrentUser } from "@/lib/AuthContext";
import { dashboardPathForRole, getAccessToken } from "@/lib/auth";
import { CATEGORY_LABELS, type VendorCategory } from "@/lib/mockData";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];

// Onboarding step 2 for customers: optional interests, then done. Step 1
// (name + role) already happened on /onboarding.
export default function CustomerOnboardingPage() {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const checkedRef = useRef(false);

  const [categoryTags, setCategoryTags] = useState<VendorCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || checkedRef.current) return;
    checkedRef.current = true;
    if (!user) {
      router.replace("/login");
    } else if (user.onboarding_completed) {
      router.replace(dashboardPathForRole(user.role));
    } else if (!user.first_name) {
      router.replace("/onboarding");
    } else if (user.role !== "customer") {
      router.replace(`/onboarding/${user.role}`);
    }
  }, [isLoading, user, router]);

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

    try {
      const updated = await apiFetch<CurrentUser>("/auth/onboarding/details/", {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { category_tags: categoryTags },
      });
      setUser(updated);
      router.push(dashboardPathForRole(updated.role));
    } catch (err) {
      setError(getApiErrorMessage(err, "Something went wrong. Please try again."));
      setSubmitting(false);
    }
  }

  if (isLoading || !user || user.onboarding_completed || !user.first_name || user.role !== "customer") {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Link href="/" className="text-2xl font-bold tracking-tight text-brand-navy">
          Showfloor
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/perfect-game-navy.png" alt="Perfect Game" className="h-4 w-auto" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Almost done, {user.first_name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            One optional question to help us show you the right stuff.
          </p>
        </div>

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
