"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Spinner } from "@/components/Spinner";
import { apiFetch, apiFetchMultipart, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useSiteSettings } from "@/lib/SiteSettingsContext";

type CarouselSlide = {
  id: number;
  image_url: string | null;
  caption: string;
  alt_text: string;
  link_url: string;
  order: number;
  active: boolean;
  created_at: string;
};

export default function ManageWebsitePage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Manage Website</h1>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
          Control what visitors see on the public site without touching any code.
        </p>

        <HomepageCarouselSection />
        <ArticlesTabSection />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Homepage Carousel
// ---------------------------------------------------------------------------

function HomepageCarouselSection() {
  const confirm = useConfirm();
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Same "drag/move locally, save separately" pattern as Manage
  // Categories — nothing hits the network until "Save order" is clicked.
  const [draftOrderIds, setDraftOrderIds] = useState<number[]>([]);
  const [prevSlides, setPrevSlides] = useState(slides);
  const [isOrderDirty, setIsOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploadLinkUrl, setUploadLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editAltText, setEditAltText] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function refresh() {
    apiFetch<CarouselSlide[]>("/admin/home-carousel/", {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        setSlides(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  if (slides !== prevSlides) {
    setPrevSlides(slides);
    const serverIds = slides.map((s) => s.id);
    if (!isOrderDirty) {
      setDraftOrderIds(serverIds);
    } else {
      setDraftOrderIds((current) => {
        const serverSet = new Set(serverIds);
        const kept = current.filter((id) => serverSet.has(id));
        const keptSet = new Set(kept);
        const added = serverIds.filter((id) => !keptSet.has(id));
        return [...kept, ...added];
      });
    }
  }

  const slideById = new Map(slides.map((s) => [s.id, s]));
  const displaySlides = draftOrderIds
    .map((id) => slideById.get(id))
    .filter((s): s is CarouselSlide => !!s);

  function reorderLocally(id: number, targetIndex: number) {
    setDraftOrderIds((current) => {
      const fromIndex = current.indexOf(id);
      if (fromIndex === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, id);
      return next;
    });
    setIsOrderDirty(true);
  }

  function handleMoveButton(id: number, direction: "up" | "down") {
    const index = draftOrderIds.indexOf(id);
    reorderLocally(id, direction === "up" ? index - 1 : index + 1);
  }

  function handleDrop(targetId: number) {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    reorderLocally(draggedId, draftOrderIds.indexOf(targetId));
    setDraggedId(null);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch("/admin/home-carousel/reorder/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { order: draftOrderIds },
      });
      setIsOrderDirty(false);
      setSuccess("Carousel order saved.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the new order."));
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDiscardOrder() {
    setIsOrderDirty(false);
    setDraftOrderIds(slides.map((s) => s.id));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setUploadFile(e.target.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("image", uploadFile);
      if (uploadCaption.trim()) formData.append("caption", uploadCaption.trim());
      if (uploadAltText.trim()) formData.append("alt_text", uploadAltText.trim());
      if (uploadLinkUrl.trim()) formData.append("link_url", uploadLinkUrl.trim());
      await apiFetchMultipart("/admin/home-carousel/", formData, {
        accessToken: getAccessToken() ?? undefined,
      });
      setUploadFile(null);
      setUploadCaption("");
      setUploadAltText("");
      setUploadLinkUrl("");
      const fileInput = document.getElementById(
        "carousel-upload-input",
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setSuccess("Image added to the carousel.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not upload this image."));
    } finally {
      setUploading(false);
    }
  }

  function startEditing(slide: CarouselSlide) {
    setEditingId(slide.id);
    setEditCaption(slide.caption);
    setEditAltText(slide.alt_text);
    setEditLinkUrl(slide.link_url);
  }

  async function submitEdit(id: number) {
    setSavingEditId(id);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("caption", editCaption.trim());
      formData.append("alt_text", editAltText.trim());
      formData.append("link_url", editLinkUrl.trim());
      await apiFetchMultipart(`/admin/home-carousel/${id}/`, formData, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
      });
      setEditingId(null);
      setSuccess("Slide details saved.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this slide's details."));
    } finally {
      setSavingEditId(null);
    }
  }

  async function handleToggleActive(slide: CarouselSlide) {
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("active", slide.active ? "false" : "true");
      await apiFetchMultipart(`/admin/home-carousel/${slide.id}/`, formData, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
      });
      setSuccess(slide.active ? "Slide hidden from the homepage." : "Slide shown on the homepage.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not update this slide."));
    }
  }

  async function handleDelete(slide: CarouselSlide) {
    if (slides.length <= 1) {
      setError("Can't delete the last carousel image — upload a replacement first.");
      return;
    }
    const ok = await confirm({
      title: "Remove this carousel image?",
      message:
        "This image will be permanently removed from the homepage carousel. This can't be undone.",
      confirmLabel: "Remove image",
      tone: "danger",
    });
    if (!ok) return;

    setDeletingId(slide.id);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/admin/home-carousel/${slide.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setSuccess("Carousel image removed.");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not remove this image."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mb-12 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800">
      <h2 className="text-lg font-semibold">Homepage Carousel</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        These images rotate at the top of the homepage. Drag a row (or use the arrows) to reorder,
        then save. At least one image must always remain.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {success}
        </p>
      )}

      {/* Add new image */}
      <div className="mt-5 rounded-md border border-dashed border-gray-300 p-4 dark:border-gray-700">
        <p className="mb-3 text-sm font-medium">Add a new image</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="carousel-upload-input" className="mb-1 block text-xs text-gray-500">
              Image file (JPEG, PNG, WEBP, or GIF — max 8MB)
            </label>
            <input
              id="carousel-upload-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Caption (optional)</label>
            <input
              type="text"
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Alt text (optional)</label>
            <input
              type="text"
              value={uploadAltText}
              onChange={(e) => setUploadAltText(e.target.value)}
              placeholder="Describes the image for screen readers"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-500">Link URL (optional)</label>
            <input
              type="text"
              value={uploadLinkUrl}
              onChange={(e) => setUploadLinkUrl(e.target.value)}
              placeholder="/events or https://..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!uploadFile || uploading}
          className="mt-3 rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Add image"}
        </button>
      </div>

      {isOrderDirty && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <span className="text-amber-800 dark:text-amber-300">Unsaved order changes.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDiscardOrder}
              disabled={savingOrder}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={savingOrder}
              className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-navy disabled:opacity-50"
            >
              {savingOrder ? "Saving…" : "Save order"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5">
        {isLoading ? (
          <Spinner />
        ) : loadError ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Could not load the carousel. Please try again.
          </p>
        ) : displaySlides.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No carousel images yet — add one above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {displaySlides.map((slide, index) => (
              <li
                key={slide.id}
                draggable
                onDragStart={() => setDraggedId(slide.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(slide.id)}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${
                  draggedId === slide.id ? "opacity-40" : ""
                }`}
              >
                <div className="flex items-center gap-2 sm:flex-col">
                  <span className="cursor-grab select-none text-gray-300 dark:text-gray-600" aria-hidden="true">
                    ⠿
                  </span>
                  <div className="flex gap-1 sm:flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveButton(slide.id, "up")}
                      className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === displaySlides.length - 1}
                      onClick={() => handleMoveButton(slide.id, "down")}
                      className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                {slide.image_url ? (
                  // Backend-served image from a dynamic host, same
                  // convention as ArticleCard/the venue floor-map image
                  // rather than next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.image_url}
                    alt={slide.alt_text || slide.caption || "Carousel image"}
                    className="h-20 w-32 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-20 w-32 shrink-0 rounded-md bg-gray-100 dark:bg-gray-800" />
                )}

                <div className="flex-1">
                  {editingId === slide.id ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        placeholder="Caption"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      <input
                        type="text"
                        value={editAltText}
                        onChange={(e) => setEditAltText(e.target.value)}
                        placeholder="Alt text"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      <input
                        type="text"
                        value={editLinkUrl}
                        onChange={(e) => setEditLinkUrl(e.target.value)}
                        placeholder="Link URL"
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm sm:col-span-2 dark:border-gray-700 dark:bg-transparent"
                      />
                      <div className="flex gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => submitEdit(slide.id)}
                          disabled={savingEditId === slide.id}
                          className="rounded-md bg-brand-blue px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                        >
                          {savingEditId === slide.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">{slide.caption || "(No caption)"}</p>
                      {slide.alt_text && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Alt text: {slide.alt_text}
                        </p>
                      )}
                      {slide.link_url && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Links to: {slide.link_url}
                        </p>
                      )}
                      {!slide.active && (
                        <span className="mt-1 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          Hidden from homepage
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editingId !== slide.id && (
                  <div className="flex gap-2 sm:flex-col">
                    <button
                      type="button"
                      onClick={() => startEditing(slide)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(slide)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                    >
                      {slide.active ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(slide)}
                      disabled={deletingId === slide.id}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {deletingId === slide.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Website Navigation / Articles Tab
// ---------------------------------------------------------------------------

function ArticlesTabSection() {
  const { refresh: refreshPublicSettings } = useSiteSettings();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ articles_tab_enabled: boolean }>("/admin/settings/", {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        if (!cancelled) setEnabled(data.articles_tab_enabled);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this setting.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    if (enabled === null) return;
    const nextValue = !enabled;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiFetch<{ articles_tab_enabled: boolean }>("/admin/settings/", {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { articles_tab_enabled: nextValue },
      });
      setEnabled(data.articles_tab_enabled);
      setSuccess(
        data.articles_tab_enabled
          ? "Articles tab is now visible on the public site."
          : "Articles tab is now hidden from the public site.",
      );
      // So this admin's own NavBar/Footer flip immediately too, without a
      // full page reload.
      refreshPublicSettings();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this setting."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800">
      <h2 className="text-lg font-semibold">Website Navigation</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Control which sections appear in the site&apos;s top navigation. Hiding a section never
        deletes its content.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {success}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-4 rounded-md border border-gray-200 p-4 dark:border-gray-800">
        <div>
          <p className="font-medium">Show Articles Tab</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            When on, &ldquo;Articles&rdquo; appears in the top navigation and published articles
            stay publicly accessible. When off, the tab disappears — existing articles (draft,
            published, or archived) are never deleted.
          </p>
        </div>
        {isLoading || enabled === null ? (
          <Spinner />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
              enabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        )}
      </div>
    </section>
  );
}
