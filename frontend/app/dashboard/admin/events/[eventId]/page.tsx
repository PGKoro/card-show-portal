"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { Pagination } from "@/components/Pagination";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";
import { toDatetimeLocalValue, type ShowEvent } from "@/lib/events";
import { EventForm, type EventFormPayload } from "../EventForm";

type NoteLogEntry = {
  id: number;
  event: number;
  admin: string | null;
  author_id: number | null;
  note: string;
  created_at: string;
};

type PaginatedNoteResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: NoteLogEntry[];
};

function EventNotePanel({ eventId }: { eventId: number }) {
  const { user: currentUser } = useAuth();
  const viewerIsOwner = currentUser?.role === "owner";
  const [draftNote, setDraftNote] = useState("");
  const [noteHistory, setNoteHistory] = useState<NoteLogEntry[]>([]);
  const [noteTotal, setNoteTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadHistory(nextPage = page) {
    try {
      const data = await apiFetch<PaginatedNoteResponse>(`/events/${eventId}/notes/history/?page=${nextPage}&page_size=5`, {
        accessToken: getAccessToken() ?? undefined,
      });
      setNoteHistory(data.results);
      setNoteTotal(data.count);
      setHasNext(Boolean(data.next));
      setHasPrevious(Boolean(data.previous));
    } catch {
      setNoteHistory([]);
      setNoteTotal(0);
      setHasNext(false);
      setHasPrevious(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadHistory();
  }, [eventId, page]);

  async function postNote(event: FormEvent) {
    event.preventDefault();
    if (!draftNote.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/events/${eventId}/notes/history/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { note: draftNote.trim() },
      });
      setDraftNote("");
      setPage(1);
      await loadHistory(1);
      setSuccess("Note saved.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save event note."));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteNote(noteId: number) {
    setDeletingId(noteId);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/events/${eventId}/notes/${noteId}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setPage(1);
      await loadHistory(1);
      setSuccess("Note deleted.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete event note."));
    } finally {
      setDeletingId(null);
    }
  }

  function startEditingNote(entry: NoteLogEntry) {
    setEditingNoteId(entry.id);
    setEditingNoteText(entry.note);
  }

  function cancelEditingNote() {
    setEditingNoteId(null);
    setEditingNoteText("");
  }

  async function submitEditNote(noteId: number) {
    if (!editingNoteText.trim()) return;
    setEditSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/events/${eventId}/notes/${noteId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { note: editingNoteText.trim() },
      });
      setEditingNoteId(null);
      setEditingNoteText("");
      await loadHistory(page);
      setSuccess("Note updated.");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not update event note."));
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin notes</h2>
        <span className="text-xs text-gray-400">{noteTotal} total</span>
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
          disabled={submitting || !draftNote.trim()}
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post note"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}

      {loading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading history…</p>
      ) : noteHistory.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No notes posted yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {noteHistory.map((entry) => {
            const canManageThisNote = viewerIsOwner || entry.author_id === currentUser?.pk;
            const isEditing = editingNoteId === entry.id;
            return (
              <article key={entry.id} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <div className="font-medium text-gray-700 dark:text-gray-200">{entry.admin ?? "Unknown admin"}</div>
                    <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                  </div>
                  {canManageThisNote && !isEditing && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEditingNote(entry)}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteNote(entry.id)}
                        disabled={deletingId === entry.id}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {deletingId === entry.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitEditNote(entry.id)}
                        disabled={editSubmitting || !editingNoteText.trim()}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {editSubmitting ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingNote}
                        disabled={editSubmitting}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{entry.note}</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        hasNext={hasNext}
        hasPrevious={hasPrevious}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    </section>
  );
}

function FloorPlanPanel({ event, onEventUpdate }: { event: ShowEvent; onEventUpdate: (e: ShowEvent) => void }) {
  const [mapVisible, setMapVisible] = useState(event.map_visible);
  const [mapVisibleToVendors, setMapVisibleToVendors] = useState(event.map_visible_to_vendors);
  const [loyaltyDeadline, setLoyaltyDeadline] = useState(toDatetimeLocalValue(event.loyalty_priority_deadline));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasVenue = Boolean(event.map_venue_detail);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<ShowEvent>(`/events/${event.id}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          map_visible: mapVisible,
          map_visible_to_vendors: mapVisibleToVendors,
          loyalty_priority_deadline: loyaltyDeadline ? new Date(loyaltyDeadline).toISOString() : null,
        },
      });
      onEventUpdate(updated);
      setSaved(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save floor plan settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-transparent">
      <h2 className="text-lg font-semibold">Floor Plan &amp; Booths</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pick a floor plan venue above, then control who can see it here.</p>

      {!hasVenue ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Link a floor plan venue above (and save) to enable booth visibility and requests.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
            <span>{event.map_venue_detail!.name}</span>
            <Link href={`/dashboard/admin/venues/${event.map_venue_detail!.pk}`} className="text-brand-blue hover:underline">
              Edit floor plan
            </Link>
          </div>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mapVisibleToVendors}
                  onChange={(e) => setMapVisibleToVendors(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Visible to vendors (booth self-selection open)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mapVisible}
                  onChange={(e) => setMapVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Visible to the public
              </label>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Loyalty priority deadline <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={loyaltyDeadline}
                onChange={(e) => setLoyaltyDeadline(e.target.value)}
                className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Until this passes, a vendor who held a booth at this venue&apos;s most recent event gets first right of refusal on that same booth.
              </p>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {saved && !error && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save floor plan settings"}
              </button>
              <Link
                href={`/dashboard/admin/events/${event.id}/registrations`}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                Review booth requests
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<ShowEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ShowEvent>(`/events/${params.eventId}/`, { accessToken: getAccessToken() ?? undefined })
      .then((data) => {
        if (!cancelled) setEvent(data);
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
  }, [params.eventId]);

  async function handleSubmit(payload: EventFormPayload) {
    const updated = await apiFetch<ShowEvent>(`/events/${params.eventId}/`, {
      method: "PATCH",
      accessToken: getAccessToken() ?? undefined,
      body: payload,
    });
    setEvent(updated);
  }

  if (loading) return <AuthPageSpinner />;

  if (notFound || !event) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <Link href="/dashboard/admin/events" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          ← Manage Events
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard/admin/events" className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline">
          ← Manage Events
        </Link>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Edit Event</h1>
          <button
            type="button"
            onClick={async () => {
              try {
                const duplicated = await apiFetch<ShowEvent>(`/events/${event.id}/duplicate/`, {
                  method: "POST",
                  accessToken: getAccessToken() ?? undefined,
                });
                router.push(`/dashboard/admin/events/${duplicated.id}`);
              } catch (err) {
                alert(getApiErrorMessage(err, "Could not duplicate this event."));
              }
            }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Duplicate Event
          </button>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
          <section>
            <EventForm
              submitLabel="Save changes"
              initialValues={{
                name: event.name,
                description: event.description,
                start_date: event.start_date,
                end_date: event.end_date,
                estimated_cards: event.estimated_cards,
                estimated_attendees: event.estimated_attendees,
                vendors_detail: event.vendors_detail,
                map_venue: event.map_venue,
                map_venue_detail: event.map_venue_detail,
                announcement: event.announcement ?? "",
                notes: event.notes ?? "",
                registration_deadline: event.registration_deadline,
              }}
              showNotes={false}
              onSubmit={handleSubmit}
            />
          </section>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Edit Event</h1>
          <Link
            href={`/dashboard/admin/events/${event.id}/vendors`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            View attending vendors ({event.vendor_count})
          </Link>
        </div>
        <EventForm
          submitLabel="Save changes"
          initialValues={{
            name: event.name,
            description: event.description,
            start_date: event.start_date,
            end_date: event.end_date,
            map_venue: event.map_venue,
            map_venue_detail: event.map_venue_detail,
            announcement: event.announcement ?? "",
            notes: event.notes ?? "",
            registration_deadline: event.registration_deadline,
          }}
          onSubmit={handleSubmit}
        />

          <aside className="space-y-4">
            <EventNotePanel eventId={event.id} />
            <FloorPlanPanel event={event} onEventUpdate={setEvent} />
          </aside>
        </div>
      </div>
    </main>
  );
}
