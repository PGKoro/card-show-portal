"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { EventForm, type EventFormPayload } from "../EventForm";

export default function NewEventPage() {
  const router = useRouter();

  async function handleSubmit(payload: EventFormPayload) {
    await apiFetch("/events/", {
      method: "POST",
      accessToken: getAccessToken() ?? undefined,
      body: payload,
    });
    router.push("/dashboard/admin/events");
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin/events"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Events
        </Link>
        <h1 className="mb-6 text-2xl font-semibold">Add Event</h1>
        <EventForm submitLabel="Create event" onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
