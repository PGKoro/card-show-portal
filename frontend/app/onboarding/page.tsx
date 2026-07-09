"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getApiErrorMessage, apiFetch } from "@/lib/api";
import { useAuth, type CurrentUser } from "@/lib/AuthContext";
import { getAccessToken, postAuthPath } from "@/lib/auth";

type Role = "customer" | "vendor";

// Step 1 of onboarding: name + role. Step 2 (role-specific details) lives
// on its own page — /onboarding/customer or /onboarding/vendor — reached
// after this step saves successfully.
export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const checkedRef = useRef(false);

  const [role, setRole] = useState<Role>("customer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || checkedRef.current) return;
    checkedRef.current = true;
    if (!user) {
      router.replace("/login");
    } else if (user.onboarding_completed) {
      router.replace(postAuthPath(user));
    } else if (user.first_name) {
      // Step 1 already done (e.g. they left mid-flow and came back) —
      // resume at step 2 instead of asking for their name again.
      router.replace(`/onboarding/${user.role}`);
    }
  }, [isLoading, user, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const updated = await apiFetch<CurrentUser>("/auth/onboarding/", {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { role, first_name: firstName, last_name: lastName },
      });
      setUser(updated);
      router.push(`/onboarding/${role}`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Something went wrong. Please try again."));
      setSubmitting(false);
    }
  }

  if (isLoading || !user || user.onboarding_completed || user.first_name) {
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
          <h1 className="text-2xl font-semibold">Tell us about yourself</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Just a couple more details before you&apos;re set up.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium">
              First name
            </label>
            <input
              id="firstName"
              type="text"
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
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
            />
          </div>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium">I&apos;m signing up as a...</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["customer", "vendor"] as Role[]).map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-md border px-4 py-3 text-center text-sm font-medium capitalize ${
                  role === option
                    ? "border-brand-blue bg-brand-blue/5 text-brand-blue"
                    : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                  className="sr-only"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
