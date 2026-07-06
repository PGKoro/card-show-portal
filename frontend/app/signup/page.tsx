"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { apiFetch, ApiError } from "@/lib/api";

type RegisterResponse = {
  access: string;
  refresh: string;
};

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiFetch<RegisterResponse>("/auth/registration/", {
        method: "POST",
        body: { email, password1, password2 },
      });
      // TODO: persist access/refresh tokens and redirect to the
      // appropriate dashboard once role assignment exists.
    } catch (err) {
      setError(err instanceof ApiError ? "Could not create account." : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign up</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>

        <div>
          <label htmlFor="password1" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password1"
            type="password"
            required
            value={password1}
            onChange={(e) => setPassword1(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>

        <div>
          <label htmlFor="password2" className="block text-sm font-medium">
            Confirm password
          </label>
          <input
            id="password2"
            type="password"
            required
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Sign up"}
        </button>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
