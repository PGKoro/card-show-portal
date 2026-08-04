"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { apiFetch, apiFetchMultipart, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories } from "@/lib/CategoriesContext";
import {
  aisleGridBounds,
  BOOTH_SIZE,
  generateAisleGrid,
  MAP_PRESETS,
  percent,
  resolveMapImage,
  type VenueAmenity,
  type VenueBooth,
  type VenueMap,
  type VenueSection,
} from "@/lib/floorMap";
import { themeFor } from "@/lib/profileThemes";

type Rect = { x: number; y: number; w: number; h: number };
type Mode = "select" | "booth" | "section" | "amenity";
// What kind of shape a drag/live-rect is acting on — distinct from Mode
// (the toolbar's current tool), since a drag target is always a real shape.
type ShapeKind = "booth" | "section" | "amenity";

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
  kind: ShapeKind;
  id: number;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: Rect;
  moved: boolean;
  // Set only when dragging a booth that's part of a multi-selection — every
  // selected booth's starting rect, so the whole group translates together
  // by the same delta instead of just the one the drag started on.
  groupStartRects?: Map<number, Rect>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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

// Scans existing (purely numeric) booth numbers and returns the next one in
// sequence, so re-entering a venue resumes correctly without a separate
// counter to keep in sync. Non-numeric booth numbers (e.g. from before this
// was plain numbers) are ignored rather than breaking the scan.
function nextPlainBoothNumber(existingBooths: VenueBooth[]): string {
  let max = 0;
  for (const booth of existingBooths) {
    const n = parseInt(booth.booth_number, 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return String(max + 1);
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

  // "Select" is the default — you land ready to multi-select/move existing
  // booths. Placing new ones is opt-in via the "Place booths" button.
  const [mode, setMode] = useState<Mode>("select");
  const modeRef = useRef<Mode>("select");
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

  // Custom vendor markers (sponsor tables, food trucks, etc. that aren't
  // real registered vendors) auto-save immediately, same as sections —
  // lower-stakes overlays, not staged like booths.
  const [amenities, setAmenities] = useState<VenueAmenity[]>([]);

  const [editingAmenity, setEditingAmenity] = useState<VenueAmenity | "new" | null>(null);
  const [amenityFormRect, setAmenityFormRect] = useState<Rect | null>(null);
  const [amenityLabel, setAmenityLabel] = useState("");
  const [amenityLogoFile, setAmenityLogoFile] = useState<File | null>(null);
  const [amenityFormError, setAmenityFormError] = useState<string | null>(null);
  const [amenitySubmitting, setAmenitySubmitting] = useState(false);

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
  const amenitiesRef = useRef<VenueAmenity[]>([]);
  useEffect(() => {
    amenitiesRef.current = amenities;
  }, [amenities]);

  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  // Mirrors `draftRect`/`liveRect` so onMouseUp can read the current value
  // as a plain variable instead of a setState functional updater — React's
  // Strict Mode intentionally invokes updater functions twice in dev to
  // catch impure ones, which would double-fire any side effect (creating a
  // booth, committing a drag) placed inside one.
  const draftRectRef = useRef<Rect | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const [liveRect, setLiveRect] = useState<{ kind: ShapeKind; id: number; rect: Rect } | null>(
    null,
  );
  const liveRectRef = useRef<{ kind: ShapeKind; id: number; rect: Rect } | null>(null);

  // Multi-select ("Select booths" mode, the default): drag over empty map
  // area draws a marquee rectangle; every booth it touches gets selected.
  // Dragging any one selected booth afterward moves the whole group
  // together (see groupStartRects above).
  const [selectedBoothIds, setSelectedBoothIds] = useState<Set<number>>(new Set());
  const selectedBoothIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    selectedBoothIdsRef.current = selectedBoothIds;
  }, [selectedBoothIds]);

  // A selection only means anything in "select" mode — clear it when
  // switching to Place Booths/Mark Category Zones so a leftover selection
  // can't cause a later drag in those modes to be mistaken for a group move.
  function switchMode(next: Mode) {
    if (mode === "select" && next !== "select") {
      setSelectedBoothIds(new Set());
    }
    setMode(next);
  }

  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRectRef = useRef<Rect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  const [liveGroupRects, setLiveGroupRects] = useState<Map<number, Rect> | null>(null);
  const liveGroupRectsRef = useRef<Map<number, Rect> | null>(null);

  // Default price drives fast bulk placement: every click/drag on the map
  // immediately stages a new booth numbered with the next plain sequential
  // number at the current default price — no per-booth dialog. Click an
  // already-placed booth afterward to fix up any one of them (rename,
  // reprice, delete).
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

  // "Generate Grid" — auto-places a whole perfectly-aligned grid of booths
  // (paired across an aisle, plain numeric numbering) instead of relying on
  // dragging each one by hand. Staged the same way as a single click-placed
  // booth (pendingCreateIds), so Save/Discard changes work identically.
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [gridRows, setGridRows] = useState("5");
  const [gridColumns, setGridColumns] = useState("6");
  const [gridColumnsPerGroup, setGridColumnsPerGroup] = useState("2");
  const [gridStartNumber, setGridStartNumber] = useState("100");
  const [gridColumnStep, setGridColumnStep] = useState("2");
  const [gridBandStep, setGridBandStep] = useState("100");
  const [gridError, setGridError] = useState<string | null>(null);

  // Live schematic preview of the grid these parameters would produce —
  // recomputed on every keystroke with the exact same math used to actually
  // place the booths, so what you see here is what you get on Generate.
  // null means the current parameters aren't generateable yet (same checks
  // as handleGenerateGrid): the preview just goes quiet rather than erroring
  // while you're still mid-edit.
  const gridPreview = useMemo(() => {
    const rows = parseInt(gridRows, 10);
    const columns = parseInt(gridColumns, 10);
    const columnsPerGroup = parseInt(gridColumnsPerGroup, 10);
    const startNumber = parseInt(gridStartNumber, 10);
    const columnStep = parseInt(gridColumnStep, 10);
    const bandStep = parseInt(gridBandStep, 10);
    if (
      [rows, columns, columnsPerGroup, startNumber, columnStep, bandStep].some(
        (n) => Number.isNaN(n) || n <= 0,
      )
    ) {
      return null;
    }
    if (columnsPerGroup > columns) return null;

    const params = {
      rows,
      columns,
      columnsPerGroup,
      startNumber,
      columnStep,
      bandStep,
      boothWidth: BOOTH_SIZE.w,
      boothHeight: BOOTH_SIZE.h,
    };
    const bounds = aisleGridBounds(params);
    if (bounds.width > 100 || bounds.height > 100) return null;

    return { booths: generateAisleGrid(params), bounds };
  }, [gridRows, gridColumns, gridColumnsPerGroup, gridStartNumber, gridColumnStep, gridBandStep]);

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
        setAmenities(map.amenities);
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

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedBoothIds(new Set());
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  async function commitAmenityRect(amenityId: number, rect: Rect) {
    try {
      const updated = await apiFetch<VenueAmenity>(`/venues/amenities/${amenityId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: {
          position_x: rect.x.toFixed(2),
          position_y: rect.y.toFixed(2),
          width: rect.w.toFixed(2),
          height: rect.h.toFixed(2),
        },
      });
      setAmenities((current) => current.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      // Best effort — reload from server to discard a failed drag.
      try {
        const map = await apiFetch<VenueMap>(`/venues/${venueId}/map/`, {
          accessToken: getAccessToken() ?? undefined,
        });
        setAmenities(map.amenities);
      } catch {
        // ignore
      }
    }
  }

  function openEditBoothForm(booth: VenueBooth) {
    setSelectedBoothIds(new Set());
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
    const boothNumber = nextPlainBoothNumber(boothsRef.current);
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

  function openGridModal() {
    setGridError(null);
    setGridModalOpen(true);
  }

  function closeGridModal() {
    setGridModalOpen(false);
  }

  function handleGenerateGrid(e: FormEvent) {
    e.preventDefault();
    setGridError(null);

    const rows = parseInt(gridRows, 10);
    const columns = parseInt(gridColumns, 10);
    const columnsPerGroup = parseInt(gridColumnsPerGroup, 10);
    const startNumber = parseInt(gridStartNumber, 10);
    const columnStep = parseInt(gridColumnStep, 10);
    const bandStep = parseInt(gridBandStep, 10);
    if ([rows, columns, columnsPerGroup, startNumber, columnStep, bandStep].some(
      (n) => Number.isNaN(n) || n <= 0,
    )) {
      setGridError("All fields must be positive numbers.");
      return;
    }
    if (columnsPerGroup > columns) {
      setGridError("Columns per aisle group can't be more than the total number of columns.");
      return;
    }

    const params = {
      rows,
      columns,
      columnsPerGroup,
      startNumber,
      columnStep,
      bandStep,
      boothWidth: BOOTH_SIZE.w,
      boothHeight: BOOTH_SIZE.h,
    };

    const bounds = aisleGridBounds(params);
    if (bounds.width > 100 || bounds.height > 100) {
      setGridError(
        `This grid is too big for the map (needs ${bounds.width.toFixed(0)}% width, ` +
          `${bounds.height.toFixed(0)}% height — both must fit within 100%). Reduce rows/columns.`,
      );
      return;
    }

    const generated = generateAisleGrid(params);
    const existingNumbers = new Set(boothsRef.current.map((b) => b.booth_number));
    const collisions = generated.filter((g) => existingNumbers.has(g.booth_number));
    if (collisions.length > 0) {
      setGridError(
        `These booth numbers already exist: ${collisions.map((c) => c.booth_number).join(", ")}. ` +
          "Change the starting number, or remove the conflicting booths first.",
      );
      return;
    }

    const newBooths: VenueBooth[] = generated.map((g) => {
      const tempId = nextTempIdRef.current--;
      return {
        id: tempId,
        booth_number: g.booth_number,
        position_x: g.position_x.toFixed(2),
        position_y: g.position_y.toFixed(2),
        width: g.width.toFixed(2),
        height: g.height.toFixed(2),
        price: (Number(defaultBoothPrice) || 0).toFixed(2),
        created_at: "",
        updated_at: "",
      };
    });

    boothsRef.current = [...boothsRef.current, ...newBooths];
    setBooths(boothsRef.current);
    setPendingCreateIds((current) => {
      const next = new Set(current);
      newBooths.forEach((b) => next.add(b.id));
      return next;
    });
    setGridModalOpen(false);
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

  function openNewAmenityForm(rect: Rect) {
    setAmenityLabel("");
    setAmenityLogoFile(null);
    setAmenityFormError(null);
    setEditingAmenity("new");
    setAmenityFormRect(rect);
  }

  function openEditAmenityForm(amenity: VenueAmenity) {
    setAmenityLabel(amenity.label);
    setAmenityLogoFile(null);
    setAmenityFormError(null);
    setEditingAmenity(amenity);
    setAmenityFormRect(null);
  }

  function closeAmenityForm() {
    setEditingAmenity(null);
    setAmenityFormRect(null);
  }

  async function handleAmenityFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amenityLabel.trim()) {
      setAmenityFormError("Enter a brand name.");
      return;
    }
    setAmenitySubmitting(true);
    setAmenityFormError(null);
    try {
      if (editingAmenity === "new") {
        if (!amenityFormRect) return;
        let created: VenueAmenity;
        if (amenityLogoFile) {
          const formData = new FormData();
          formData.append("label", amenityLabel.trim());
          formData.append("position_x", amenityFormRect.x.toFixed(2));
          formData.append("position_y", amenityFormRect.y.toFixed(2));
          formData.append("width", amenityFormRect.w.toFixed(2));
          formData.append("height", amenityFormRect.h.toFixed(2));
          formData.append("logo_image", amenityLogoFile);
          created = await apiFetchMultipart<VenueAmenity>(`/venues/${venueId}/amenities/`, formData, {
            accessToken: getAccessToken() ?? undefined,
          });
        } else {
          created = await apiFetch<VenueAmenity>(`/venues/${venueId}/amenities/`, {
            method: "POST",
            accessToken: getAccessToken() ?? undefined,
            body: {
              label: amenityLabel.trim(),
              position_x: amenityFormRect.x.toFixed(2),
              position_y: amenityFormRect.y.toFixed(2),
              width: amenityFormRect.w.toFixed(2),
              height: amenityFormRect.h.toFixed(2),
            },
          });
        }
        setAmenities((current) => [...current, created]);
      } else if (editingAmenity) {
        let updated: VenueAmenity;
        if (amenityLogoFile) {
          const formData = new FormData();
          formData.append("label", amenityLabel.trim());
          formData.append("logo_image", amenityLogoFile);
          updated = await apiFetchMultipart<VenueAmenity>(
            `/venues/amenities/${editingAmenity.id}/`,
            formData,
            { method: "PATCH", accessToken: getAccessToken() ?? undefined },
          );
        } else {
          updated = await apiFetch<VenueAmenity>(`/venues/amenities/${editingAmenity.id}/`, {
            method: "PATCH",
            accessToken: getAccessToken() ?? undefined,
            body: { label: amenityLabel.trim() },
          });
        }
        setAmenities((current) => current.map((a) => (a.id === updated.id ? updated : a)));
      }
      closeAmenityForm();
    } catch (err) {
      setAmenityFormError(getApiErrorMessage(err, "Could not save this amenity."));
    } finally {
      setAmenitySubmitting(false);
    }
  }

  async function handleDeleteAmenity() {
    if (editingAmenity === "new" || !editingAmenity) return;
    const target = editingAmenity;
    const ok = await confirm({
      title: "Remove this marker?",
      message: `The ${target.label || "custom vendor"} marker will be removed.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;

    setAmenitySubmitting(true);
    try {
      await apiFetch(`/venues/amenities/${target.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setAmenities((current) => current.filter((a) => a.id !== target.id));
      closeAmenityForm();
    } catch (err) {
      setAmenityFormError(getApiErrorMessage(err, "Could not remove this marker."));
    } finally {
      setAmenitySubmitting(false);
    }
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

        if (drag.groupStartRects) {
          const next = new Map<number, Rect>();
          for (const [id, startRect] of drag.groupStartRects) {
            next.set(id, {
              x: clamp(startRect.x + dxPct, 0, 100 - startRect.w),
              y: clamp(startRect.y + dyPct, 0, 100 - startRect.h),
              w: startRect.w,
              h: startRect.h,
            });
          }
          liveGroupRectsRef.current = next;
          setLiveGroupRects(next);
          return;
        }

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

      if (marqueeStartRef.current) {
        const start = marqueeStartRef.current;
        const curX = clamp(((e.clientX - bounds.left) / bounds.width) * 100, 0, 100);
        const curY = clamp(((e.clientY - bounds.top) / bounds.height) * 100, 0, 100);
        marqueeRectRef.current = {
          x: Math.min(start.x, curX),
          y: Math.min(start.y, curY),
          w: Math.abs(curX - start.x),
          h: Math.abs(curY - start.y),
        };
        setMarqueeRect(marqueeRectRef.current);
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
          liveGroupRectsRef.current = null;
          setLiveGroupRects(null);
          if (drag.mode === "move") {
            if (drag.kind === "booth") {
              const booth = boothsRef.current.find((b) => b.id === drag.id);
              if (booth) openEditBoothForm(booth);
            } else if (drag.kind === "section") {
              const section = sectionsRef.current.find((s) => s.id === drag.id);
              if (section) openEditSectionForm(section);
            } else {
              const amenity = amenitiesRef.current.find((a) => a.id === drag.id);
              if (amenity) openEditAmenityForm(amenity);
            }
          }
          return;
        }

        if (drag.groupStartRects) {
          const finalRects = liveGroupRectsRef.current;
          liveGroupRectsRef.current = null;
          setLiveGroupRects(null);
          if (finalRects) {
            for (const [id, rect] of finalRects) {
              commitBoothRectLocally(id, rect);
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
          } else if (drag.kind === "section") {
            void commitSectionRect(drag.id, current.rect);
          } else {
            void commitAmenityRect(drag.id, current.rect);
          }
        }
        return;
      }

      if (marqueeStartRef.current) {
        marqueeStartRef.current = null;
        const rect = marqueeRectRef.current;
        marqueeRectRef.current = null;
        setMarqueeRect(null);
        if (rect && rect.w > 0.5 && rect.h > 0.5) {
          const hits = boothsRef.current.filter((b) => rectsIntersect(rectFromShape(b), rect));
          setSelectedBoothIds(new Set(hits.map((b) => b.id)));
        } else {
          setSelectedBoothIds(new Set());
        }
        return;
      }

      if (drawStartRef.current) {
        const start = drawStartRef.current;
        drawStartRef.current = null;
        const current = draftRectRef.current;
        draftRectRef.current = null;
        setDraftRect(null);

        if (modeRef.current === "amenity") {
          // Drawn like a section (drag a rect, or a plain click drops it at
          // the standard booth footprint), then opens a form for its brand
          // name + logo.
          if (current && current.w > 1.5 && current.h > 1.5) {
            openNewAmenityForm(current);
          } else {
            openNewAmenityForm({
              x: clamp(start.x, 0, 100 - BOOTH_SIZE.w),
              y: clamp(start.y, 0, 100 - BOOTH_SIZE.h),
              w: BOOTH_SIZE.w,
              h: BOOTH_SIZE.h,
            });
          }
          return;
        }

        if (current && current.w > 1.5 && current.h > 1.5) {
          if (modeRef.current === "booth") {
            createBoothAt(current);
          } else {
            openNewSectionForm(current);
          }
        } else if (modeRef.current === "booth") {
          // A plain click (no drag) drops a standard-size booth anchored
          // at the click point instead of a zero-size rectangle.
          createBoothAt({
            x: clamp(start.x, 0, 100 - BOOTH_SIZE.w),
            y: clamp(start.y, 0, 100 - BOOTH_SIZE.h),
            w: BOOTH_SIZE.w,
            h: BOOTH_SIZE.h,
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

    // In "Select" mode, dragging empty map area draws a marquee selection
    // instead of drawing a new booth — booth creation only happens in
    // "Place booths" mode.
    if (modeRef.current === "select") {
      marqueeStartRef.current = { x, y };
      marqueeRectRef.current = { x, y, w: 0, h: 0 };
      setMarqueeRect(marqueeRectRef.current);
      return;
    }

    drawStartRef.current = { x, y };
    draftRectRef.current = { x, y, w: 0, h: 0 };
    setDraftRect(draftRectRef.current);
  }

  function startMoveBooth(e: React.MouseEvent, booth: VenueBooth) {
    e.stopPropagation();
    e.preventDefault();
    const selected = selectedBoothIdsRef.current;
    const isGroupMove = selected.size > 1 && selected.has(booth.id);
    dragRef.current = {
      kind: "booth",
      id: booth.id,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(booth),
      moved: false,
      groupStartRects: isGroupMove
        ? new Map(
            boothsRef.current.filter((b) => selected.has(b.id)).map((b) => [b.id, rectFromShape(b)]),
          )
        : undefined,
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

  function startMoveAmenity(e: React.MouseEvent, amenity: VenueAmenity) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "amenity",
      id: amenity.id,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(amenity),
      moved: false,
    };
  }

  function startResizeAmenity(e: React.MouseEvent, amenity: VenueAmenity) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "amenity",
      id: amenity.id,
      mode: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rectFromShape(amenity),
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
          This layout is reused across every event held at this venue. Drag over empty space to
          select multiple booths, then drag any one of them to move the whole group together —
          click a single booth to edit or remove it. Switch to Place Booths to click or drag and
          add new ones.
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
                onClick={() => switchMode("select")}
                className={`rounded-md border px-3 py-1.5 font-medium ${
                  mode === "select"
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 dark:border-gray-700"
                }`}
              >
                Select booths
              </button>
              <button
                type="button"
                onClick={() => switchMode("booth")}
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
                onClick={() => switchMode("section")}
                className={`rounded-md border px-3 py-1.5 font-medium ${
                  mode === "section"
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 dark:border-gray-700"
                }`}
              >
                Mark category zones
              </button>
              <button
                type="button"
                onClick={() => switchMode("amenity")}
                className={`rounded-md border px-3 py-1.5 font-medium ${
                  mode === "amenity"
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-gray-300 dark:border-gray-700"
                }`}
              >
                Place custom vendors
              </button>
            </div>

            {mode === "select" && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {selectedBoothIds.size > 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <span>
                      {selectedBoothIds.size} selected — drag any one to move them together
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBoothIds(new Set())}
                      className="font-medium underline hover:no-underline"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-400">
                    Drag over empty space to select multiple booths.
                  </span>
                )}
              </div>
            )}

            {mode === "booth" && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
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

                <span className="text-gray-400">Next: {nextPlainBoothNumber(booths)}</span>

                <button
                  type="button"
                  onClick={openGridModal}
                  className="rounded-md border border-gray-300 px-2.5 py-1 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Generate Grid…
                </button>
              </div>
            )}

            {mode === "amenity" && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-gray-400">
                  Drag to draw a marker, then add a brand name and logo.
                </span>
              </div>
            )}
          </div>
        )}

        {displayImageUrl && (
          // min-w keeps booth/section/amenity markers from crowding into an
          // unreadable mess on narrow screens — overflow-x-auto lets the
          // editor scroll horizontally there instead of squeezing to fit.
          <div className="overflow-x-auto">
          <div
            ref={containerRef}
            onMouseDown={onContainerMouseDown}
            className="relative mt-4 w-full min-w-[560px] cursor-crosshair select-none overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
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
                liveGroupRects?.get(booth.id) ??
                (liveRect && liveRect.kind === "booth" && liveRect.id === booth.id
                  ? liveRect.rect
                  : rectFromShape(booth));
              const isPending = pendingCreateIds.has(booth.id) || pendingUpdateIds.has(booth.id);
              const isSelected = selectedBoothIds.has(booth.id);
              return (
                <div
                  key={`booth-${booth.id}`}
                  onMouseDown={(e) => startMoveBooth(e, booth)}
                  title={`Booth ${booth.booth_number} — $${booth.price}${isPending ? " (unsaved)" : ""}`}
                  className={`absolute flex items-center justify-center overflow-hidden rounded border-2 bg-brand-blue/20 hover:bg-brand-blue/30 ${
                    mode === "section" || mode === "amenity" ? "pointer-events-none" : "cursor-move"
                  } ${isPending ? "border-dashed border-brand-blue" : "border-brand-blue"} ${
                    isSelected ? "z-10 ring-2 ring-amber-400 ring-offset-1" : ""
                  }`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                >
                  <span className="pointer-events-none truncate px-0.5 text-[10px] font-medium text-brand-navy dark:text-white">
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

            {amenities.map((amenity) => {
              const rect =
                liveRect && liveRect.kind === "amenity" && liveRect.id === amenity.id
                  ? liveRect.rect
                  : rectFromShape(amenity);
              const theme = themeFor(amenity.label);
              return (
                <div
                  key={`amenity-${amenity.id}`}
                  onMouseDown={(e) => startMoveAmenity(e, amenity)}
                  title={amenity.label || "Custom vendor"}
                  className={`absolute overflow-hidden rounded border-2 border-emerald-500 ${
                    mode === "amenity" ? "cursor-move" : "pointer-events-none"
                  }`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                >
                  {amenity.logo_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={amenity.logo_image_url}
                      alt=""
                      className="pointer-events-none h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className={`pointer-events-none flex h-full w-full items-center justify-center p-0.5 text-center ${theme.avatarClassName}`}
                    >
                      <span className="truncate text-[9px] font-medium text-white">
                        {amenity.label || "Custom"}
                      </span>
                    </div>
                  )}
                  {mode === "amenity" && (
                    <div
                      onMouseDown={(e) => startResizeAmenity(e, amenity)}
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-emerald-600"
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

            {marqueeRect && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/10"
                style={{
                  left: `${marqueeRect.x}%`,
                  top: `${marqueeRect.y}%`,
                  width: `${marqueeRect.w}%`,
                  height: `${marqueeRect.h}%`,
                }}
              />
            )}
          </div>
          </div>
        )}

        {displayImageUrl && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {booths.length} booth{booths.length === 1 ? "" : "s"}, {sections.length} category
              zone{sections.length === 1 ? "" : "s"}, {amenities.length} custom vendor
              {amenities.length === 1 ? "" : "s"}.
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
                <button
                  type="button"
                  onClick={() => {
                    if (!editingBooth) return;
                    const base = rectFromShape(editingBooth);
                    setBooths((current) =>
                      current.map((b) =>
                        b.id === editingBooth.id
                          ? {
                              ...b,
                              position_x: clamp(base.x, 0, 100 - BOOTH_SIZE.w).toFixed(2),
                              position_y: clamp(base.y, 0, 100 - BOOTH_SIZE.h).toFixed(2),
                              width: BOOTH_SIZE.w.toFixed(2),
                              height: BOOTH_SIZE.h.toFixed(2),
                            }
                          : b,
                      ),
                    );
                    if (!pendingCreateIds.has(editingBooth.id)) {
                      setPendingUpdateIds((c) => new Set(c).add(editingBooth.id));
                    }
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Reset to standard size
                </button>
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

      {editingAmenity !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeAmenityForm}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editingAmenity === "new" ? "New custom vendor" : "Edit custom vendor"}
            </h2>

            <form onSubmit={handleAmenityFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Brand name
                </label>
                <input
                  type="text"
                  value={amenityLabel}
                  onChange={(e) => setAmenityLabel(e.target.value)}
                  placeholder="e.g. Acme Trading Co"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Logo (optional — falls back to a solid color with the brand name)
                </label>
                <div className="flex items-center gap-3">
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
                    <span className="max-w-[10rem] truncate">
                      {amenityLogoFile ? amenityLogoFile.name : "Choose file"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAmenityLogoFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                  {editingAmenity !== "new" && editingAmenity.logo_image_url && !amenityLogoFile && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editingAmenity.logo_image_url}
                      alt="Current logo"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  )}
                </div>
              </div>

              {amenityFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">{amenityFormError}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div>
                  {editingAmenity !== "new" && (
                    <button
                      type="button"
                      onClick={handleDeleteAmenity}
                      disabled={amenitySubmitting}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeAmenityForm}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={amenitySubmitting}
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

      {gridModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
          onClick={closeGridModal}
        >
          <div
            className="max-h-[calc(100vh-4rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Generate a booth grid</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Places a perfectly-aligned grid of booths for you — pairs of booths face each other
              across an aisle (e.g. {gridStartNumber || "100"} across from{" "}
              {Number(gridStartNumber || "100") + Number(gridColumnStep || "2")}), with the next
              row of pairs starting {gridBandStep || "100"} higher.
            </p>

            <form onSubmit={handleGenerateGrid} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Rows (aisle bands)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridRows}
                    onChange={(e) => setGridRows(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Columns
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridColumns}
                    onChange={(e) => setGridColumns(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Columns per aisle group
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridColumnsPerGroup}
                    onChange={(e) => setGridColumnsPerGroup(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Starting number
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridStartNumber}
                    onChange={(e) => setGridStartNumber(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Column step
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridColumnStep}
                    onChange={(e) => setGridColumnStep(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Band step
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={gridBandStep}
                    onChange={(e) => setGridBandStep(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                  />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Preview
                </span>
                {gridPreview ? (
                  <>
                    <div
                      className="relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950"
                      style={{
                        aspectRatio: `${gridPreview.bounds.width} / ${gridPreview.bounds.height}`,
                      }}
                    >
                      {gridPreview.booths.map((b, i) => (
                        <div
                          key={i}
                          className="absolute rounded-sm bg-brand-blue/60"
                          style={{
                            left: `${(b.position_x / gridPreview.bounds.width) * 100}%`,
                            top: `${(b.position_y / gridPreview.bounds.height) * 100}%`,
                            width: `${(b.width / gridPreview.bounds.width) * 100}%`,
                            height: `${(b.height / gridPreview.bounds.height) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {gridPreview.booths.length} booths, numbered{" "}
                      {gridPreview.booths[0].booth_number}–
                      {gridPreview.booths[gridPreview.booths.length - 1].booth_number}.
                    </p>
                  </>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700">
                    Enter valid values above to preview the grid.
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Uses the price set above (${defaultBoothPrice || "0"}) for every generated booth.
                You can still drag, resize, rename, or delete any of them afterward.
              </p>

              {gridError && <p className="text-sm text-red-600 dark:text-red-400">{gridError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeGridModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
                >
                  Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
