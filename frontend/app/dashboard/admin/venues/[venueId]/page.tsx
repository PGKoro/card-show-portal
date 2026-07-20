"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { apiFetch, apiFetchMultipart, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import {
  BOOTH_SIZE_PRESETS,
  MAP_PRESETS,
  percent,
  resolveMapImage,
  type BoothSizeKey,
  type VenueBooth,
  type VenueMap,
  type VenueSection,
} from "@/lib/floorMap";

type Rect = { x: number; y: number; w: number; h: number };
type Mode = "booth" | "section";

// Module-scoped (not per-render/per-effect) so it dedupes a given native
// mouseup event exactly once even if React ends up with more than one copy
// of the window listener attached (observed under dev/Fast-Refresh) — each
// duplicate delivery of the SAME event object is a no-op past the first.
const HANDLED_MOUSEUP_EVENTS = new WeakSet<Event>();

// A marker being dragged/resized isn't persisted on every mousemove — only
// once the gesture crosses a small pixel threshold ("moved") and finally
// releases. A mousedown+mouseup with no movement is treated as a click that
// opens the edit form instead of a no-op position change.
type DragState = {
  kind: Mode;
  id: number;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: Rect;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectFromShape(shape: {
  position_x: string;
  position_y: string;
  width: string;
  height: string;
}): Rect {
  return {
    x: percent(shape.position_x),
    y: percent(shape.position_y),
    w: percent(shape.width),
    h: percent(shape.height),
  };
}

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

// Scans existing booth numbers matching "<prefix><digits>" and returns the
// next one in sequence (zero-padded to at least 3 digits, e.g. A001, A002,
// ...), so re-entering a venue (or switching rows) resumes correctly
// without a separate counter to keep in sync.
function nextBoothNumber(existingBooths: VenueBooth[], prefix: string): string {
  const clean = prefix || "A";
  let max = 0;
  for (const booth of existingBooths) {
    if (!booth.booth_number.startsWith(clean)) continue;
    const suffix = booth.booth_number.slice(clean.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, parseInt(suffix, 10));
  }
  return `${clean}${String(max + 1).padStart(3, "0")}`;
}

function boothToPayload(booth: VenueBooth) {
  return {
    booth_number: booth.booth_number,
    position_x: booth.position_x,
    position_y: booth.position_y,
    width: booth.width,
    height: booth.height,
    price: booth.price,
  };
}

export default function VenueMapEditorPage() {
  const { venueId } = useParams<{ venueId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { categories, labelFor, styleFor } = useCategories();

  const [venueName, setVenueName] = useState("");
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [mapImagePreset, setMapImagePreset] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [choosingPreset, setChoosingPreset] = useState(false);

  const displayImageUrl = resolveMapImage({
    map_image_url: mapImageUrl,
    map_image_preset: mapImagePreset,
  });

  const [mode, setMode] = useState<Mode>("booth");
  const modeRef = useRef<Mode>("booth");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Booths are staged locally and only sent to the server on "Save changes"
  // — see handleSaveChanges. Sections auto-save immediately (lower-stakes,
  // purely visual wayfinding zones).
  const [booths, setBooths] = useState<VenueBooth[]>([]);
  const savedBoothsRef = useRef<VenueBooth[]>([]);
  const [pendingCreateIds, setPendingCreateIds] = useState<Set<number>>(new Set());
  const [pendingUpdateIds, setPendingUpdateIds] = useState<Set<number>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [savingChanges, setSavingChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nextTempIdRef = useRef(-1);
  const isDirty =
    pendingCreateIds.size > 0 || pendingUpdateIds.size > 0 || pendingDeleteIds.size > 0;

  const [sections, setSections] = useState<VenueSection[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const boothsRef = useRef<VenueBooth[]>([]);
  useEffect(() => {
    boothsRef.current = booths;
  }, [booths]);
  const pendingCreateIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    pendingCreateIdsRef.current = pendingCreateIds;
  }, [pendingCreateIds]);
  const sectionsRef = useRef<VenueSection[]>([]);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  // Mirrors `draftRect`/`liveRect` so onMouseUp can read the current value
  // as a plain variable instead of a setState functional updater — React's
  // Strict Mode intentionally invokes updater functions twice in dev to
  // catch impure ones, which would double-fire any side effect (creating a
  // booth, committing a drag) placed inside one.
  const draftRectRef = useRef<Rect | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const [liveRect, setLiveRect] = useState<{ kind: Mode; id: number; rect: Rect } | null>(null);
  const liveRectRef = useRef<{ kind: Mode; id: number; rect: Rect } | null>(null);

  const [newBoothSize, setNewBoothSize] = useState<BoothSizeKey>("small");
  const newBoothSizeRef = useRef<BoothSizeKey>("small");
  useEffect(() => {
    newBoothSizeRef.current = newBoothSize;
  }, [newBoothSize]);

  // Row prefix + default price drive fast bulk placement: every click/drag
  // on the map immediately stages a new booth numbered "<prefix><next seq>"
  // (e.g. A001, A002, ...) at the current default price — no per-booth
  // dialog. Click an already-placed booth afterward to fix up any one of
  // them (rename, reprice, delete).
  const [boothRowPrefix, setBoothRowPrefix] = useState("A");
  const boothRowPrefixRef = useRef("A");
  useEffect(() => {
    boothRowPrefixRef.current = boothRowPrefix;
  }, [boothRowPrefix]);

  const [defaultBoothPrice, setDefaultBoothPrice] = useState("0");
  const defaultBoothPriceRef = useRef("0");
  useEffect(() => {
    defaultBoothPriceRef.current = defaultBoothPrice;
  }, [defaultBoothPrice]);

  const [editingBooth, setEditingBooth] = useState<VenueBooth | null>(null);
  const [boothNumber, setBoothNumber] = useState("");
  const [boothPrice, setBoothPrice] = useState("0");
  const [boothFormError, setBoothFormError] = useState<string | null>(null);

  const [editingSection, setEditingSection] = useState<VenueSection | "new" | null>(null);
  const [sectionFormRect, setSectionFormRect] = useState<Rect | null>(null);
  const [sectionCategory, setSectionCategory] = useState("");
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [sectionSubmitting, setSectionSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPageError(null);
      try {
        const map = await apiFetch<VenueMap>(`/venues/${venueId}/map/`, {
          accessToken: getAccessToken() ?? undefined,
        });
        if (cancelled) return;
        setVenueName(map.name);
        setMapImageUrl(map.map_image_url);
        setMapImagePreset(map.map_image_preset);
        setBooths(map.booths);
        savedBoothsRef.current = map.booths;
        setSections(map.sections);
      } catch (err) {
        if (!cancelled) setPageError(getApiErrorMessage(err, "Could not load this venue."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function commitBoothRectLocally(boothId: number, rect: Rect) {
    setBooths((current) =>
      current.map((b) =>
        b.id === boothId
          ? {
              ...b,
              position_x: rect.x.toFixed(2),
              position_y: rect.y.toFixed(2),
              width: rect.w.toFixed(2),
              height: rect.h.toFixed(2),
            }
          : b,
      ),
    );
    if (!pendingCreateIdsRef.current.has(boothId)) {
      setPendingUpdateIds((current) => new Set(current).add(boothId));
    }
  }

  async function commitSectionRect(sectionId: number, rect: Rect) {
    try {
      const updated = await apiFetch<VenueSection>(`/venues/sections/${sectionId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          position_x: rect.x.toFixed(2),
          position_y: rect.y.toFixed(2),
          width: rect.w.toFixed(2),
          height: rect.h.toFixed(2),
        },
      });
      setSections((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // Best effort — reload from server to discard a failed drag.
      try {
        const map = await apiFetch<VenueMap>(`/venues/${venueId}/map/`, {
          accessToken: getAccessToken() ?? undefined,
        });
        setSections(map.sections);
      } catch {
        // ignore
      }
    }
  }

  function openEditBoothForm(booth: VenueBooth) {
    setBoothFormError(null);
    setEditingBooth(booth);
    setBoothNumber(booth.booth_number);
    setBoothPrice(booth.price);
  }

  function closeBoothForm() {
    setEditingBooth(null);
  }

  // The fast path: every click/drag on the map lands here directly, staging
  // a new booth at the current row/price defaults with no dialog. Click the
  // placed marker afterward (openEditBoothForm) to fix up any one of them.
  function createBoothAt(rect: Rect) {
    const boothNumber = nextBoothNumber(boothsRef.current, boothRowPrefixRef.current);
    const price = Number(defaultBoothPriceRef.current) || 0;
    const tempId = nextTempIdRef.current--;
    const newBooth: VenueBooth = {
      id: tempId,
      booth_number: boothNumber,
      position_x: rect.x.toFixed(2),
      position_y: rect.y.toFixed(2),
      width: rect.w.toFixed(2),
      height: rect.h.toFixed(2),
      price: price.toFixed(2),
      created_at: "",
      updated_at: "",
    };
    // Update the ref synchronously (not just via the usual booths->ref
    // effect) so back-to-back clicks fired before the next render/effect
    // still see the just-added booth and never compute the same number twice.
    boothsRef.current = [...boothsRef.current, newBooth];
    setBooths(boothsRef.current);
    setPendingCreateIds((current) => new Set(current).add(tempId));
  }

  function resetSectionForm() {
    setSectionCategory(categories[0]?.slug ?? "");
    setSectionFormError(null);
  }

  function openNewSectionForm(rect: Rect) {
    resetSectionForm();
    setEditingSection("new");
    setSectionFormRect(rect);
  }

  function openEditSectionForm(section: VenueSection) {
    resetSectionForm();
    setEditingSection(section);
    setSectionFormRect(null);
    setSectionCategory(section.category || categories[0]?.slug || "");
  }

  function closeSectionForm() {
    setEditingSection(null);
    setSectionFormRect(null);
  }

  // Global listeners are always mounted and no-op unless a drag or a
  // rectangle-draw is in progress (tracked via refs, not state, so this
  // effect never needs to re-subscribe mid-gesture).
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const drag = dragRef.current;
      if (drag) {
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        const dxPct = (dx / bounds.width) * 100;
        const dyPct = (dy / bounds.height) * 100;
        const next: Rect =
          drag.mode === "move"
            ? {
                x: clamp(drag.startRect.x + dxPct, 0, 100 - drag.startRect.w),
                y: clamp(drag.startRect.y + dyPct, 0, 100 - drag.startRect.h),
                w: drag.startRect.w,
                h: drag.startRect.h,
              }
            : {
                x: drag.startRect.x,
                y: drag.startRect.y,
                w: clamp(drag.startRect.w + dxPct, 1, 100 - drag.startRect.x),
                h: clamp(drag.startRect.h + dyPct, 1, 100 - drag.startRect.y),
              };
        liveRectRef.current = { kind: drag.kind, id: drag.id, rect: next };
        setLiveRect(liveRectRef.current);
        return;
      }

      if (drawStartRef.current) {
        const start = drawStartRef.current;
        const curX = clamp(((e.clientX - bounds.left) / bounds.width) * 100, 0, 100);
        const curY = clamp(((e.clientY - bounds.top) / bounds.height) * 100, 0, 100);
        draftRectRef.current = {
          x: Math.min(start.x, curX),
          y: Math.min(start.y, curY),
          w: Math.abs(curX - start.x),
          h: Math.abs(curY - start.y),
        };
        setDraftRect(draftRectRef.current);
      }
    }

    // Side effects (creating/committing a booth or section) run as plain
    // statements here, never inside a setState functional updater — Strict
    // Mode's dev-only double-invoke of updater functions would otherwise
    // double-fire them. `onMouseUp` itself only ever runs once per real
    // event, so this is enough on its own (the WeakSet guard below is just
    // an extra belt-and-suspenders check).
    function onMouseUp(e: MouseEvent) {
      if (HANDLED_MOUSEUP_EVENTS.has(e)) return;
      HANDLED_MOUSEUP_EVENTS.add(e);

      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        if (!drag.moved) {
          liveRectRef.current = null;
          setLiveRect(null);
          if (drag.mode === "move") {
            if (drag.kind === "booth") {
              const booth = boothsRef.current.find((b) => b.id === drag.id);
              if (booth) openEditBoothForm(booth);
            } else {
              const section = sectionsRef.current.find((s) => s.id === drag.id);
              if (section) openEditSectionForm(section);
            }
          }
          return;
        }
        const current = liveRectRef.current;
        liveRectRef.current = null;
        setLiveRect(null);
        if (current && current.kind === drag.kind && current.id === drag.id) {
          if (drag.kind === "booth") {
            commitBoothRectLocally(drag.id, current.rect);
          } else {
            void commitSectionRect(drag.id, current.rect);
          }
        }
        return;
      }

      if (drawStartRef.current) {
        const start = drawStartRef.current;
        drawStartRef.current = null;
        const current = draftRectRef.current;
        draftRectRef.current = null;
        setDraftRect(null);

        if (current && current.w > 1.5 && current.h > 1.5) {
          if (modeRef.current === "booth") {
            createBoothAt(current);
          } else {
            openNewSectionForm(current);
          }
        } else if (modeRef.current === "booth") {
          // A plain click (no drag) drops a standard-size booth anchored
          // at the click point instead of a zero-size rectangle.
          const preset = BOOTH_SIZE_PRESETS[newBoothSizeRef.current];
          createBoothAt({
            x: clamp(start.x, 0, 100 - preset.w),
            y: clamp(start.y, 0, 100 - preset.h),
            w: preset.w,
            h: preset.h,
          });
        }
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onContainerMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const y = clamp(((e.clientY - bounds.top) / bounds.height) * 100, 0, 100);
    drawStartRef.current = { x, y };
    draftRectRef.current = { x, y, w: 0, h: 0 };
    setDraftRect(draftRectRef.current);
  }

  function startMoveBooth(e: React.MouseEvent, booth: VenueBooth) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "booth",
      id: booth.id,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(booth),
      moved: false,
    };
  }

  function startResizeBooth(e: React.MouseEvent, booth: VenueBooth) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "booth",
      id: booth.id,
      mode: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(booth),
      moved: false,
    };
  }

  function startMoveSection(e: React.MouseEvent, section: VenueSection) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "section",
      id: section.id,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(section),
      moved: false,
    };
  }

  function startResizeSection(e: React.MouseEvent, section: VenueSection) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "section",
      id: section.id,
      mode: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(section),
      moved: false,
    };
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("map_image", uploadFile);
      const data = await apiFetchMultipart<VenueMap>(`/venues/${venueId}/map-image/`, formData, {
        accessToken: getAccessToken() ?? undefined,
      });
      setMapImageUrl(data.map_image_url);
      setMapImagePreset(data.map_image_preset);
      setUploadFile(null);
    } catch (err) {
      setUploadError(getApiErrorMessage(err, "Could not upload this image."));
    } finally {
      setUploading(false);
    }
  }

  async function handleChoosePreset(key: string) {
    setChoosingPreset(true);
    setUploadError(null);
    try {
      const data = await apiFetch<VenueMap>(`/venues/${venueId}/map-preset/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { preset: key },
      });
      setMapImageUrl(data.map_image_url);
      setMapImagePreset(data.map_image_preset);
    } catch (err) {
      setUploadError(getApiErrorMessage(err, "Could not select this layout."));
    } finally {
      setChoosingPreset(false);
    }
  }

  function handleBoothFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingBooth) return;
    const trimmedNumber = boothNumber.trim();
    if (!trimmedNumber) {
      setBoothFormError("Enter a booth number.");
      return;
    }
    const price = Number(boothPrice);
    if (Number.isNaN(price) || price < 0) {
      setBoothFormError("Enter a valid, non-negative price.");
      return;
    }
    const duplicate = booths.some(
      (b) => b.booth_number === trimmedNumber && b.id !== editingBooth.id,
    );
    if (duplicate) {
      setBoothFormError("A booth with this number already exists for this venue.");
      return;
    }

    const targetId = editingBooth.id;
    setBooths((current) =>
      current.map((b) =>
        b.id === targetId ? { ...b, booth_number: trimmedNumber, price: price.toFixed(2) } : b,
      ),
    );
    if (!pendingCreateIds.has(targetId)) {
      setPendingUpdateIds((current) => new Set(current).add(targetId));
    }
    closeBoothForm();
  }

  async function handleDeleteBooth() {
    if (!editingBooth) return;
    const target = editingBooth;
    const ok = await confirm({
      title: "Remove this booth?",
      message: `Booth ${target.booth_number} will be removed once you save changes.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;

    setBooths((current) => current.filter((b) => b.id !== target.id));
    if (pendingCreateIds.has(target.id)) {
      setPendingCreateIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    } else {
      setPendingUpdateIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
      setPendingDeleteIds((current) => new Set(current).add(target.id));
    }
    closeBoothForm();
  }

  function handleDiscardChanges() {
    setBooths(savedBoothsRef.current.map((b) => ({ ...b })));
    setPendingCreateIds(new Set());
    setPendingUpdateIds(new Set());
    setPendingDeleteIds(new Set());
    setSaveError(null);
    closeBoothForm();
  }

  async function handleSaveChanges() {
    const creates = booths.filter((b) => pendingCreateIds.has(b.id));
    const updates = booths.filter((b) => pendingUpdateIds.has(b.id));
    const deleteIds = Array.from(pendingDeleteIds);
    if (creates.length + updates.length + deleteIds.length === 0) return;

    const parts: string[] = [];
    if (creates.length) parts.push(`${creates.length} new booth${creates.length === 1 ? "" : "s"}`);
    if (updates.length) parts.push(`${updates.length} updated`);
    if (deleteIds.length) parts.push(`${deleteIds.length} removed`);

    const ok = await confirm({
      title: "Save changes to this floor plan?",
      message: `${parts.join(", ")}.`,
      confirmLabel: "Save changes",
    });
    if (!ok) return;

    setSavingChanges(true);
    setSaveError(null);

    const [createResults, updateResults, deleteResults] = await Promise.all([
      Promise.allSettled(
        creates.map((b) =>
          apiFetch<VenueBooth>(`/venues/${venueId}/booths/`, {
            method: "POST",
            accessToken: getAccessToken() ?? undefined,
            body: boothToPayload(b),
          }).then((created) => ({ tempId: b.id, created })),
        ),
      ),
      Promise.allSettled(
        updates.map((b) =>
          apiFetch<VenueBooth>(`/venues/booths/${b.id}/`, {
            method: "PATCH",
            accessToken: getAccessToken() ?? undefined,
            body: boothToPayload(b),
          }),
        ),
      ),
      Promise.allSettled(
        deleteIds.map((id) =>
          apiFetch(`/venues/booths/${id}/`, {
            method: "DELETE",
            accessToken: getAccessToken() ?? undefined,
          }).then(() => id),
        ),
      ),
    ]);

    const successfulDeleteIds = new Set(deleteResults.filter(isFulfilled).map((r) => r.value));

    setBooths((current) => {
      let next = current;
      for (const result of createResults) {
        if (isFulfilled(result)) {
          const { tempId, created } = result.value;
          next = next.map((b) => (b.id === tempId ? created : b));
        }
      }
      for (const result of updateResults) {
        if (isFulfilled(result)) {
          const updated = result.value;
          next = next.map((b) => (b.id === updated.id ? updated : b));
        }
      }
      if (successfulDeleteIds.size > 0) {
        next = next.filter((b) => !successfulDeleteIds.has(b.id));
      }
      return next;
    });

    setPendingCreateIds((current) => {
      const next = new Set(current);
      createResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(creates[i].id);
      });
      return next;
    });
    setPendingUpdateIds((current) => {
      const next = new Set(current);
      updateResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(updates[i].id);
      });
      return next;
    });
    setPendingDeleteIds((current) => {
      const next = new Set(current);
      successfulDeleteIds.forEach((id) => next.delete(id));
      return next;
    });

    const successfulUpdatesById = new Map(
      updateResults.filter(isFulfilled).map((r) => [r.value.id, r.value]),
    );
    const nextSaved: VenueBooth[] = [];
    for (const booth of savedBoothsRef.current) {
      if (successfulDeleteIds.has(booth.id)) continue;
      nextSaved.push(successfulUpdatesById.get(booth.id) ?? booth);
    }
    for (const result of createResults) {
      if (isFulfilled(result)) nextSaved.push(result.value.created);
    }
    savedBoothsRef.current = nextSaved;

    const failures =
      createResults.filter((r) => !isFulfilled(r)).length +
      updateResults.filter((r) => !isFulfilled(r)).length +
      deleteResults.filter((r) => !isFulfilled(r)).length;

    setSavingChanges(false);
    setSaveError(
      failures > 0 ? `${failures} change${failures === 1 ? "" : "s"} couldn't be saved. Try again.` : null,
    );
  }

  async function handleSectionFormSubmit(e: FormEvent) {
    e.preventDefault();
    setSectionSubmitting(true);
    setSectionFormError(null);
    try {
      if (editingSection === "new") {
        if (!sectionFormRect) return;
        const created = await apiFetch<VenueSection>(`/venues/${venueId}/sections/`, {
          method: "POST",
          accessToken: getAccessToken() ?? undefined,
          body: {
            category: sectionCategory,
            position_x: sectionFormRect.x.toFixed(2),
            position_y: sectionFormRect.y.toFixed(2),
            width: sectionFormRect.w.toFixed(2),
            height: sectionFormRect.h.toFixed(2),
          },
        });
        setSections((current) => [...current, created]);
      } else if (editingSection) {
        const updated = await apiFetch<VenueSection>(`/venues/sections/${editingSection.id}/`, {
          method: "PATCH",
          accessToken: getAccessToken() ?? undefined,
          body: { category: sectionCategory },
        });
        setSections((current) => current.map((s) => (s.id === updated.id ? updated : s)));
      }
      closeSectionForm();
    } catch (err) {
      setSectionFormError(getApiErrorMessage(err, "Could not save this section."));
    } finally {
      setSectionSubmitting(false);
    }
  }

  async function handleDeleteSection() {
    if (editingSection === "new" || !editingSection) return;
    const target = editingSection;
    const ok = await confirm({
      title: "Delete this section?",
      message: `The ${labelFor(target.category)} zone will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    setSectionSubmitting(true);
    try {
      await apiFetch(`/venues/sections/${target.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setSections((current) => current.filter((s) => s.id !== target.id));
      closeSectionForm();
    } catch (err) {
      setSectionFormError(getApiErrorMessage(err, "Could not delete this section."));
    } finally {
      setSectionSubmitting(false);
    }
  }

  async function handleBack() {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "You have booth changes that haven't been saved yet.",
        confirmLabel: "Discard and leave",
        tone: "danger",
      });
      if (!ok) return;
    }
    router.push("/dashboard/admin/venues");
  }

  if (loading) {
    return <AuthPageSpinner />;
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Manage Venues
        </button>

        <h1 className="text-2xl font-semibold">Floor Plan — {venueName}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This layout is reused across every event held at this venue. Click the map to drop a
          booth at the set size/price/row, or drag to draw a custom size — click a placed booth
          to edit or remove it.
        </p>

        {pageError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {pageError}
          </p>
        )}

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-transparent">
          <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
              >
                <path
                  d="M10 3v9m0-9 3.5 3.5M10 3 6.5 6.5M4 13v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="max-w-[12rem] truncate">
                {uploadFile ? uploadFile.name : "Choose file"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <button
              type="submit"
              disabled={!uploadFile || uploading}
              className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
            >
              {uploading ? "Uploading..." : mapImageUrl ? "Replace image" : "Upload image"}
            </button>
          </form>
        </div>

        {uploadError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>
        )}

        <div className="mt-3">
          <p className="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            No real floor plan for this venue? Use a generic layout instead
          </p>
          <div className="flex flex-wrap gap-2">
            {MAP_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                disabled={choosingPreset}
                onClick={() => handleChoosePreset(preset.key)}
                title={preset.label}
                className={`overflow-hidden rounded-md border-2 disabled:opacity-50 ${
                  mapImagePreset === preset.key ? "border-brand-blue" : "border-gray-200 dark:border-gray-700"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preset.path} alt={preset.label} className="block h-16 w-24 object-cover" />
              </button>
            ))}
          </div>
        </div>

        {displayImageUrl && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-transparent">
            <div className="flex gap-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("booth")}
                className={`rounded-md border px-3 py-1.5 font-medium ${
                  mode === "booth"
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 dark:border-gray-700"
                }`}
              >
                Place booths
              </button>
              <button
                type="button"
                onClick={() => setMode("section")}
                className={`rounded-md border px-3 py-1.5 font-medium ${
                  mode === "section"
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 dark:border-gray-700"
                }`}
              >
                Mark category zones
              </button>
            </div>

            {mode === "booth" && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Size:</span>
                  {(Object.keys(BOOTH_SIZE_PRESETS) as BoothSizeKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewBoothSize(key)}
                      className={`rounded-md border px-2.5 py-1 font-medium ${
                        newBoothSize === key
                          ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                          : "border-gray-300 dark:border-gray-700"
                      }`}
                    >
                      {BOOTH_SIZE_PRESETS[key].label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Price ($):</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultBoothPrice}
                    onChange={(e) => setDefaultBoothPrice(e.target.value)}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-transparent"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Row:</span>
                  <input
                    type="text"
                    value={boothRowPrefix}
                    onChange={(e) =>
                      setBoothRowPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                    }
                    placeholder="A"
                    className="w-14 rounded-md border border-gray-300 px-2 py-1 text-center uppercase dark:border-gray-700 dark:bg-transparent"
                  />
                </label>

                <span className="text-gray-400">
                  Next: {nextBoothNumber(booths, boothRowPrefix || "A")}
                </span>
              </div>
            )}
          </div>
        )}

        {displayImageUrl && (
          <div
            ref={containerRef}
            onMouseDown={onContainerMouseDown}
            className="relative mt-4 w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImageUrl}
              alt="Venue floor plan"
              draggable={false}
              className="block w-full"
            />

            {sections.map((section) => {
              const rect =
                liveRect && liveRect.kind === "section" && liveRect.id === section.id
                  ? liveRect.rect
                  : rectFromShape(section);
              const category = section.category;
              return (
                <div
                  key={`section-${section.id}`}
                  onMouseDown={(e) => startMoveSection(e, section)}
                  title={`${labelFor(category)} zone`}
                  className={`absolute flex items-start p-1 ${styleFor(category)} ${
                    mode === "section" ? "cursor-move" : "pointer-events-none"
                  }`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                >
                  <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-black/50">
                    {labelFor(category)}
                  </span>
                  {mode === "section" && (
                    <div
                      onMouseDown={(e) => startResizeSection(e, section)}
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-brand-navy"
                    />
                  )}
                </div>
              );
            })}

            {booths.map((booth) => {
              const rect =
                liveRect && liveRect.kind === "booth" && liveRect.id === booth.id
                  ? liveRect.rect
                  : rectFromShape(booth);
              const isPending = pendingCreateIds.has(booth.id) || pendingUpdateIds.has(booth.id);
              return (
                <div
                  key={`booth-${booth.id}`}
                  onMouseDown={(e) => startMoveBooth(e, booth)}
                  title={`Booth ${booth.booth_number} — $${booth.price}${isPending ? " (unsaved)" : ""}`}
                  className={`absolute rounded border-2 bg-brand-blue/20 hover:bg-brand-blue/30 ${
                    mode === "booth" ? "cursor-move" : "pointer-events-none"
                  } ${isPending ? "border-dashed border-brand-blue" : "border-brand-blue"}`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                >
                  <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-brand-navy px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {booth.booth_number}
                  </span>
                  {mode === "booth" && (
                    <div
                      onMouseDown={(e) => startResizeBooth(e, booth)}
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-brand-blue"
                    />
                  )}
                </div>
              );
            })}

            {draftRect && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-brand-blue bg-brand-blue/10"
                style={{
                  left: `${draftRect.x}%`,
                  top: `${draftRect.y}%`,
                  width: `${draftRect.w}%`,
                  height: `${draftRect.h}%`,
                }}
              />
            )}
          </div>
        )}

        {displayImageUrl && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {booths.length} booth{booths.length === 1 ? "" : "s"}, {sections.length} category
              zone{sections.length === 1 ? "" : "s"}.
            </p>
            {isDirty && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Unsaved booth changes
                </span>
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  disabled={savingChanges}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={savingChanges}
                  className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                >
                  {savingChanges ? "Saving..." : "Save changes"}
                </button>
              </div>
            )}
          </div>
        )}

        {saveError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
      </div>

      {editingBooth !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeBoothForm}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Edit booth {editingBooth.booth_number}</h2>

            <form onSubmit={handleBoothFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Booth number
                </label>
                <input
                  type="text"
                  value={boothNumber}
                  onChange={(e) => setBoothNumber(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  placeholder="e.g. 331"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={boothPrice}
                  onChange={(e) => setBoothPrice(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                />
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Snap to standard size
                </span>
                <div className="flex gap-2 text-sm">
                  {(Object.keys(BOOTH_SIZE_PRESETS) as BoothSizeKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (!editingBooth) return;
                        const preset = BOOTH_SIZE_PRESETS[key];
                        const base = rectFromShape(editingBooth);
                        setBooths((current) =>
                          current.map((b) =>
                            b.id === editingBooth.id
                              ? {
                                  ...b,
                                  position_x: clamp(base.x, 0, 100 - preset.w).toFixed(2),
                                  position_y: clamp(base.y, 0, 100 - preset.h).toFixed(2),
                                  width: preset.w.toFixed(2),
                                  height: preset.h.toFixed(2),
                                }
                              : b,
                          ),
                        );
                        if (!pendingCreateIds.has(editingBooth.id)) {
                          setPendingUpdateIds((c) => new Set(c).add(editingBooth.id));
                        }
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                    >
                      {BOOTH_SIZE_PRESETS[key].label}
                    </button>
                  ))}
                </div>
              </div>

              {boothFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">{boothFormError}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={handleDeleteBooth}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeBoothForm}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingSection !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeSectionForm}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editingSection === "new" ? "New category zone" : "Edit category zone"}
            </h2>

            <form onSubmit={handleSectionFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Category
                </label>
                <select
                  value={sectionCategory}
                  onChange={(e) => setSectionCategory(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                >
                  {categories.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {sectionFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">{sectionFormError}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div>
                  {editingSection !== "new" && (
                    <button
                      type="button"
                      onClick={handleDeleteSection}
                      disabled={sectionSubmitting}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeSectionForm}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sectionSubmitting}
                    className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
