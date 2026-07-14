"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import {
  ApiError,
  apiFetch,
  apiFetchMultipart,
  getApiErrorMessage,
  type PaginatedResponse,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Booth, BoothSizeKey, EventMap, MapSection } from "@/lib/floorMap";
import { BOOTH_SIZE_PRESETS, MAP_PRESETS, percent, resolveMapImage } from "@/lib/floorMap";
import { CATEGORY_LABELS, CATEGORY_STYLES, type VendorCategory } from "@/lib/mockData";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];

type VendorSearchResult = { pk: number; email: string; business_name: string };

type Rect = { x: number; y: number; w: number; h: number };

type PercentBox = { position_x: string; position_y: string; width: string; height: string };

type DragTarget = { kind: "booth"; id: number } | { kind: "section"; id: number };

// A marker being dragged/resized isn't persisted on every mousemove — only
// once the gesture crosses a small pixel threshold ("moved") and finally
// releases. A mousedown+mouseup with no movement is treated as a click that
// opens the edit form instead of a no-op position change.
type DragState = {
  target: DragTarget;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: Rect;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectFrom(box: PercentBox): Rect {
  return {
    x: percent(box.position_x),
    y: percent(box.position_y),
    w: percent(box.width),
    h: percent(box.height),
  };
}

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

// Anchors a standard booth size at (x, y), nudging it back inside the map
// bounds if it would otherwise overflow the edge.
function clampBoothPlacement(x: number, y: number, size: { w: number; h: number }): Rect {
  return {
    x: clamp(x, 0, 100 - size.w),
    y: clamp(y, 0, 100 - size.h),
    w: size.w,
    h: size.h,
  };
}

function boothToPayload(booth: Booth) {
  return {
    booth_number: booth.booth_number,
    position_x: booth.position_x,
    position_y: booth.position_y,
    width: booth.width,
    height: booth.height,
    vendor: booth.vendor,
    unlinked_vendor_name: booth.unlinked_vendor_name,
    unlinked_vendor_category: booth.unlinked_vendor_category,
    unlinked_vendor_contact: booth.unlinked_vendor_contact,
  };
}

function sectionToPayload(section: MapSection) {
  return {
    category: section.category,
    position_x: section.position_x,
    position_y: section.position_y,
    width: section.width,
    height: section.height,
  };
}

export default function EventMapEditorPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const confirm = useConfirm();

  const [eventName, setEventName] = useState("");
  const [mapVisible, setMapVisible] = useState(false);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [mapImagePreset, setMapImagePreset] = useState("");
  const [booths, setBooths] = useState<Booth[]>([]);
  const [sections, setSections] = useState<MapSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [choosingPreset, setChoosingPreset] = useState(false);
  const [togglingVisible, setTogglingVisible] = useState(false);

  const displayImageUrl = resolveMapImage({
    map_image_url: mapImageUrl,
    map_image_preset: mapImagePreset,
  });

  // Which kind of object a click-drag on the canvas background creates.
  const [drawMode, setDrawMode] = useState<"booth" | "section">("booth");
  const drawModeRef = useRef<"booth" | "section">("booth");
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  // A plain click (no drag) in booth mode drops a standard-size booth of
  // whichever size is selected here — dragging a rectangle always makes a
  // fully custom size instead, regardless of this setting.
  const [boothSizePreset, setBoothSizePreset] = useState<BoothSizeKey>("small");
  const boothSizePresetRef = useRef<BoothSizeKey>("small");
  useEffect(() => {
    boothSizePresetRef.current = boothSizePreset;
  }, [boothSizePreset]);

  // Booth/section edits (create/reposition/resize/reassign/delete) are
  // staged locally and only sent to the server when "Save changes" is
  // clicked — see handleSaveChanges. The savedXRef pair mirrors the last
  // known server-confirmed state, used both to detect whether there's
  // anything unsaved and to power "Discard changes".
  const savedBoothsRef = useRef<Booth[]>([]);
  const [pendingCreateIds, setPendingCreateIds] = useState<Set<number>>(new Set());
  const [pendingUpdateIds, setPendingUpdateIds] = useState<Set<number>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const nextTempIdRef = useRef(-1);

  const savedSectionsRef = useRef<MapSection[]>([]);
  const [pendingSectionCreateIds, setPendingSectionCreateIds] = useState<Set<number>>(new Set());
  const [pendingSectionUpdateIds, setPendingSectionUpdateIds] = useState<Set<number>>(new Set());
  const [pendingSectionDeleteIds, setPendingSectionDeleteIds] = useState<Set<number>>(new Set());
  const nextSectionTempIdRef = useRef(-1);

  const [savingChanges, setSavingChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isBoothsDirty =
    pendingCreateIds.size > 0 || pendingUpdateIds.size > 0 || pendingDeleteIds.size > 0;
  const isSectionsDirty =
    pendingSectionCreateIds.size > 0 ||
    pendingSectionUpdateIds.size > 0 ||
    pendingSectionDeleteIds.size > 0;
  const isDirty = isBoothsDirty || isSectionsDirty;

  const containerRef = useRef<HTMLDivElement>(null);
  const boothsRef = useRef<Booth[]>([]);
  useEffect(() => {
    boothsRef.current = booths;
  }, [booths]);
  const pendingCreateIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    pendingCreateIdsRef.current = pendingCreateIds;
  }, [pendingCreateIds]);

  const sectionsRef = useRef<MapSection[]>([]);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const pendingSectionCreateIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    pendingSectionCreateIdsRef.current = pendingSectionCreateIds;
  }, [pendingSectionCreateIds]);

  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const [liveRect, setLiveRect] = useState<{ target: DragTarget; rect: Rect } | null>(null);

  const [editing, setEditing] = useState<Booth | "new" | null>(null);
  const [formRect, setFormRect] = useState<Rect | null>(null);
  const [boothNumber, setBoothNumber] = useState("");
  const [assignMode, setAssignMode] = useState<"existing" | "unlinked">("existing");
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorSearchResult | null>(null);
  const [unlinkedName, setUnlinkedName] = useState("");
  const [unlinkedCategory, setUnlinkedCategory] = useState<VendorCategory>(CATEGORIES[0]);
  const [unlinkedContact, setUnlinkedContact] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [editingSection, setEditingSection] = useState<MapSection | "new" | null>(null);
  const [sectionFormRect, setSectionFormRect] = useState<Rect | null>(null);
  const [sectionCategory, setSectionCategory] = useState<VendorCategory>(CATEGORIES[0]);
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPageError(null);
      try {
        const [event, map, boothList, sectionList] = await Promise.all([
          apiFetch<{ name: string; map_visible: boolean }>(`/events/${eventId}/`, {
            accessToken: getAccessToken() ?? undefined,
          }),
          apiFetch<EventMap>(`/events/${eventId}/map/`, {
            accessToken: getAccessToken() ?? undefined,
          }).catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          }),
          apiFetch<PaginatedResponse<Booth>>(`/events/${eventId}/booths/?page_size=100`, {
            accessToken: getAccessToken() ?? undefined,
          }),
          apiFetch<PaginatedResponse<MapSection>>(`/events/${eventId}/sections/?page_size=100`, {
            accessToken: getAccessToken() ?? undefined,
          }),
        ]);
        if (cancelled) return;
        setEventName(event.name);
        setMapVisible(event.map_visible);
        setMapImageUrl(map?.map_image_url ?? null);
        setMapImagePreset(map?.map_image_preset ?? "");
        setBooths(boothList.results);
        savedBoothsRef.current = boothList.results;
        setSections(sectionList.results);
        savedSectionsRef.current = sectionList.results;
      } catch (err) {
        if (!cancelled) setPageError(getApiErrorMessage(err, "Could not load this event."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (editing === null || assignMode !== "existing") return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (!vendorSearch) {
        setVendorResults([]);
        return;
      }
      apiFetch<{ results: VendorSearchResult[] }>(
        `/admin/users/?role=vendor&search=${encodeURIComponent(vendorSearch)}`,
        { accessToken: getAccessToken() ?? undefined },
      ).then((data) => {
        if (!cancelled) setVendorResults(data.results);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [vendorSearch, editing, assignMode]);

  // Warn on tab close/reload if there's anything unsaved. Browsers ignore
  // custom messages here and show their own generic prompt — that's expected.
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

  function commitSectionRectLocally(sectionId: number, rect: Rect) {
    setSections((current) =>
      current.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              position_x: rect.x.toFixed(2),
              position_y: rect.y.toFixed(2),
              width: rect.w.toFixed(2),
              height: rect.h.toFixed(2),
            }
          : s,
      ),
    );
    if (!pendingSectionCreateIdsRef.current.has(sectionId)) {
      setPendingSectionUpdateIds((current) => new Set(current).add(sectionId));
    }
  }

  function resetForm() {
    setBoothNumber("");
    setAssignMode("existing");
    setVendorSearch("");
    setVendorResults([]);
    setSelectedVendor(null);
    setUnlinkedName("");
    setUnlinkedCategory(CATEGORIES[0]);
    setUnlinkedContact("");
    setFormError(null);
  }

  function openNewBoothForm(rect: Rect) {
    resetForm();
    setEditing("new");
    setFormRect(rect);
  }

  function openEditForm(booth: Booth) {
    resetForm();
    setEditing(booth);
    setFormRect(null);
    setBoothNumber(booth.booth_number);
    if (booth.vendor_detail) {
      setAssignMode("existing");
      setSelectedVendor({ pk: booth.vendor_detail.pk, email: "", business_name: booth.vendor_detail.label });
    } else {
      setAssignMode("unlinked");
      setUnlinkedName(booth.unlinked_vendor_name);
      setUnlinkedCategory((booth.unlinked_vendor_category as VendorCategory) || CATEGORIES[0]);
      setUnlinkedContact(booth.unlinked_vendor_contact);
    }
  }

  function closeForm() {
    setEditing(null);
    setFormRect(null);
  }

  // The rect currently shown for whichever booth the form has open — read
  // from live `booths` state (not the `editing` snapshot) so it stays
  // accurate if a size preset was already applied earlier in this same
  // form session.
  function currentBoothFormRect(): Rect | null {
    if (editing === "new") return formRect;
    if (!editing) return null;
    const live = booths.find((b) => b.id === editing.id);
    return live ? rectFrom(live) : rectFrom(editing);
  }

  function isBoothSizePresetActive(key: BoothSizeKey): boolean {
    const current = currentBoothFormRect();
    if (!current) return false;
    const size = BOOTH_SIZE_PRESETS[key];
    return Math.abs(current.w - size.w) < 0.5 && Math.abs(current.h - size.h) < 0.5;
  }

  function applyBoothSizePreset(key: BoothSizeKey) {
    const current = currentBoothFormRect();
    if (!current) return;
    const size = BOOTH_SIZE_PRESETS[key];
    const next = clampBoothPlacement(current.x, current.y, size);
    if (editing === "new") {
      setFormRect(next);
    } else if (editing) {
      commitBoothRectLocally(editing.id, next);
    }
  }

  function resetSectionForm() {
    setSectionCategory(CATEGORIES[0]);
    setSectionFormError(null);
  }

  function openNewSectionForm(rect: Rect) {
    resetSectionForm();
    setEditingSection("new");
    setSectionFormRect(rect);
  }

  function openEditSectionForm(section: MapSection) {
    resetSectionForm();
    setEditingSection(section);
    setSectionFormRect(null);
    setSectionCategory((section.category as VendorCategory) || CATEGORIES[0]);
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
        setLiveRect({ target: drag.target, rect: next });
        return;
      }

      if (drawStartRef.current) {
        const start = drawStartRef.current;
        const curX = clamp(((e.clientX - bounds.left) / bounds.width) * 100, 0, 100);
        const curY = clamp(((e.clientY - bounds.top) / bounds.height) * 100, 0, 100);
        setDraftRect({
          x: Math.min(start.x, curX),
          y: Math.min(start.y, curY),
          w: Math.abs(curX - start.x),
          h: Math.abs(curY - start.y),
        });
      }
    }

    function onMouseUp() {
      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        if (!drag.moved) {
          setLiveRect(null);
          if (drag.mode === "move") {
            if (drag.target.kind === "booth") {
              const booth = boothsRef.current.find((b) => b.id === drag.target.id);
              if (booth) openEditForm(booth);
            } else {
              const section = sectionsRef.current.find((s) => s.id === drag.target.id);
              if (section) openEditSectionForm(section);
            }
          }
          return;
        }
        setLiveRect((current) => {
          if (
            current &&
            current.target.kind === drag.target.kind &&
            current.target.id === drag.target.id
          ) {
            if (drag.target.kind === "booth") {
              commitBoothRectLocally(drag.target.id, current.rect);
            } else {
              commitSectionRectLocally(drag.target.id, current.rect);
            }
          }
          return null;
        });
        return;
      }

      if (drawStartRef.current) {
        const start = drawStartRef.current;
        drawStartRef.current = null;
        setDraftRect((current) => {
          if (current && current.w > 1.5 && current.h > 1.5) {
            // A real drag always means "I want this exact custom size."
            if (drawModeRef.current === "booth") {
              openNewBoothForm(current);
            } else {
              openNewSectionForm(current);
            }
          } else if (drawModeRef.current === "booth") {
            // A plain click drops a standard-size booth anchored there —
            // sections still require an actual drag to draw.
            const size = BOOTH_SIZE_PRESETS[boothSizePresetRef.current];
            openNewBoothForm(clampBoothPlacement(start.x, start.y, size));
          }
          return null;
        });
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
    setDraftRect({ x, y, w: 0, h: 0 });
  }

  function startDrag(e: React.MouseEvent, target: DragTarget, mode: "move" | "resize", rect: Rect) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      target,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: rect,
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
      const data = await apiFetchMultipart<EventMap>(`/events/${eventId}/map-image/`, formData, {
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
      const data = await apiFetch<EventMap>(`/events/${eventId}/map-preset/`, {
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

  async function handleToggleVisible() {
    setTogglingVisible(true);
    try {
      const updated = await apiFetch<{ map_visible: boolean }>(`/events/${eventId}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { map_visible: !mapVisible },
      });
      setMapVisible(updated.map_visible);
    } catch (err) {
      setPageError(getApiErrorMessage(err, "Could not update map visibility."));
    } finally {
      setTogglingVisible(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedNumber = boothNumber.trim();
    if (!trimmedNumber) {
      setFormError("Enter a booth number.");
      return;
    }
    const editingId = editing !== "new" && editing ? editing.id : null;
    const duplicate = booths.some((b) => b.booth_number === trimmedNumber && b.id !== editingId);
    if (duplicate) {
      setFormError("A booth with this number already exists for this event.");
      return;
    }

    let vendor: number | null = null;
    let vendorDetail: Booth["vendor_detail"] = null;
    let unlinkedNameValue = "";
    let unlinkedCategoryValue = "";
    let unlinkedContactValue = "";

    if (assignMode === "existing") {
      if (!selectedVendor) {
        setFormError("Select a vendor.");
        return;
      }
      vendor = selectedVendor.pk;
      vendorDetail = { pk: selectedVendor.pk, label: selectedVendor.business_name || selectedVendor.email };
    } else {
      if (!unlinkedName.trim()) {
        setFormError("Enter a vendor name.");
        return;
      }
      unlinkedNameValue = unlinkedName.trim();
      unlinkedCategoryValue = unlinkedCategory;
      unlinkedContactValue = unlinkedContact.trim();
    }

    if (editing === "new") {
      if (!formRect) return;
      const tempId = nextTempIdRef.current--;
      const newBooth: Booth = {
        id: tempId,
        booth_number: trimmedNumber,
        position_x: formRect.x.toFixed(2),
        position_y: formRect.y.toFixed(2),
        width: formRect.w.toFixed(2),
        height: formRect.h.toFixed(2),
        vendor,
        vendor_detail: vendorDetail,
        unlinked_vendor_name: unlinkedNameValue,
        unlinked_vendor_category: unlinkedCategoryValue,
        unlinked_vendor_contact: unlinkedContactValue,
        created_at: "",
        updated_at: "",
      };
      setBooths((current) => [...current, newBooth]);
      setPendingCreateIds((current) => new Set(current).add(tempId));
    } else if (editing) {
      const targetId = editing.id;
      setBooths((current) =>
        current.map((b) =>
          b.id === targetId
            ? {
                ...b,
                booth_number: trimmedNumber,
                vendor,
                vendor_detail: vendorDetail,
                unlinked_vendor_name: unlinkedNameValue,
                unlinked_vendor_category: unlinkedCategoryValue,
                unlinked_vendor_contact: unlinkedContactValue,
              }
            : b,
        ),
      );
      if (!pendingCreateIds.has(targetId)) {
        setPendingUpdateIds((current) => new Set(current).add(targetId));
      }
    }
    closeForm();
  }

  async function handleDeleteBooth() {
    if (editing === "new" || !editing) return;
    const target = editing;
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
    closeForm();
  }

  function handleSectionFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (editingSection === "new") {
      if (!sectionFormRect) return;
      const tempId = nextSectionTempIdRef.current--;
      const newSection: MapSection = {
        id: tempId,
        category: sectionCategory,
        position_x: sectionFormRect.x.toFixed(2),
        position_y: sectionFormRect.y.toFixed(2),
        width: sectionFormRect.w.toFixed(2),
        height: sectionFormRect.h.toFixed(2),
        created_at: "",
        updated_at: "",
      };
      setSections((current) => [...current, newSection]);
      setPendingSectionCreateIds((current) => new Set(current).add(tempId));
    } else if (editingSection) {
      const targetId = editingSection.id;
      setSections((current) =>
        current.map((s) => (s.id === targetId ? { ...s, category: sectionCategory } : s)),
      );
      if (!pendingSectionCreateIds.has(targetId)) {
        setPendingSectionUpdateIds((current) => new Set(current).add(targetId));
      }
    }
    closeSectionForm();
  }

  async function handleDeleteSection() {
    if (editingSection === "new" || !editingSection) return;
    const target = editingSection;
    const categoryLabel = CATEGORY_LABELS[target.category as VendorCategory] ?? target.category;
    const ok = await confirm({
      title: "Remove this section?",
      message: `This ${categoryLabel} zone will be removed once you save changes.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;

    setSections((current) => current.filter((s) => s.id !== target.id));
    if (pendingSectionCreateIds.has(target.id)) {
      setPendingSectionCreateIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    } else {
      setPendingSectionUpdateIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
      setPendingSectionDeleteIds((current) => new Set(current).add(target.id));
    }
    closeSectionForm();
  }

  function handleDiscardChanges() {
    setBooths(savedBoothsRef.current.map((b) => ({ ...b })));
    setPendingCreateIds(new Set());
    setPendingUpdateIds(new Set());
    setPendingDeleteIds(new Set());
    setSections(savedSectionsRef.current.map((s) => ({ ...s })));
    setPendingSectionCreateIds(new Set());
    setPendingSectionUpdateIds(new Set());
    setPendingSectionDeleteIds(new Set());
    setSaveError(null);
    closeForm();
    closeSectionForm();
  }

  async function handleSaveChanges() {
    const boothCreates = booths.filter((b) => pendingCreateIds.has(b.id));
    const boothUpdates = booths.filter((b) => pendingUpdateIds.has(b.id));
    const boothDeleteIds = Array.from(pendingDeleteIds);
    const sectionCreates = sections.filter((s) => pendingSectionCreateIds.has(s.id));
    const sectionUpdates = sections.filter((s) => pendingSectionUpdateIds.has(s.id));
    const sectionDeleteIds = Array.from(pendingSectionDeleteIds);

    const total =
      boothCreates.length +
      boothUpdates.length +
      boothDeleteIds.length +
      sectionCreates.length +
      sectionUpdates.length +
      sectionDeleteIds.length;
    if (total === 0) return;

    const parts: string[] = [];
    if (boothCreates.length) parts.push(`${boothCreates.length} new booth${boothCreates.length === 1 ? "" : "s"}`);
    if (boothUpdates.length) parts.push(`${boothUpdates.length} booth${boothUpdates.length === 1 ? "" : "s"} updated`);
    if (boothDeleteIds.length) parts.push(`${boothDeleteIds.length} booth${boothDeleteIds.length === 1 ? "" : "s"} removed`);
    if (sectionCreates.length) parts.push(`${sectionCreates.length} new section${sectionCreates.length === 1 ? "" : "s"}`);
    if (sectionUpdates.length) parts.push(`${sectionUpdates.length} section${sectionUpdates.length === 1 ? "" : "s"} updated`);
    if (sectionDeleteIds.length) parts.push(`${sectionDeleteIds.length} section${sectionDeleteIds.length === 1 ? "" : "s"} removed`);

    const ok = await confirm({
      title: "Save changes to this floor map?",
      message: `${parts.join(", ")}.`,
      confirmLabel: "Save changes",
    });
    if (!ok) return;

    setSavingChanges(true);
    setSaveError(null);

    const [
      boothCreateResults,
      boothUpdateResults,
      boothDeleteResults,
      sectionCreateResults,
      sectionUpdateResults,
      sectionDeleteResults,
    ] = await Promise.all([
      Promise.allSettled(
        boothCreates.map((b) =>
          apiFetch<Booth>(`/events/${eventId}/booths/`, {
            method: "POST",
            accessToken: getAccessToken() ?? undefined,
            body: boothToPayload(b),
          }).then((created) => ({ tempId: b.id, created })),
        ),
      ),
      Promise.allSettled(
        boothUpdates.map((b) =>
          apiFetch<Booth>(`/events/booths/${b.id}/`, {
            method: "PATCH",
            accessToken: getAccessToken() ?? undefined,
            body: boothToPayload(b),
          }),
        ),
      ),
      Promise.allSettled(
        boothDeleteIds.map((id) =>
          apiFetch(`/events/booths/${id}/`, {
            method: "DELETE",
            accessToken: getAccessToken() ?? undefined,
          }).then(() => id),
        ),
      ),
      Promise.allSettled(
        sectionCreates.map((s) =>
          apiFetch<MapSection>(`/events/${eventId}/sections/`, {
            method: "POST",
            accessToken: getAccessToken() ?? undefined,
            body: sectionToPayload(s),
          }).then((created) => ({ tempId: s.id, created })),
        ),
      ),
      Promise.allSettled(
        sectionUpdates.map((s) =>
          apiFetch<MapSection>(`/events/sections/${s.id}/`, {
            method: "PATCH",
            accessToken: getAccessToken() ?? undefined,
            body: sectionToPayload(s),
          }),
        ),
      ),
      Promise.allSettled(
        sectionDeleteIds.map((id) =>
          apiFetch(`/events/sections/${id}/`, {
            method: "DELETE",
            accessToken: getAccessToken() ?? undefined,
          }).then(() => id),
        ),
      ),
    ]);

    const successfulBoothDeleteIds = new Set(boothDeleteResults.filter(isFulfilled).map((r) => r.value));

    setBooths((current) => {
      let next = current;
      for (const result of boothCreateResults) {
        if (isFulfilled(result)) {
          const { tempId, created } = result.value;
          next = next.map((b) => (b.id === tempId ? created : b));
        }
      }
      for (const result of boothUpdateResults) {
        if (isFulfilled(result)) {
          const updated = result.value;
          next = next.map((b) => (b.id === updated.id ? updated : b));
        }
      }
      if (successfulBoothDeleteIds.size > 0) {
        next = next.filter((b) => !successfulBoothDeleteIds.has(b.id));
      }
      return next;
    });

    setPendingCreateIds((current) => {
      const next = new Set(current);
      boothCreateResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(boothCreates[i].id);
      });
      return next;
    });
    setPendingUpdateIds((current) => {
      const next = new Set(current);
      boothUpdateResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(boothUpdates[i].id);
      });
      return next;
    });
    setPendingDeleteIds((current) => {
      const next = new Set(current);
      successfulBoothDeleteIds.forEach((id) => next.delete(id));
      return next;
    });

    const successfulBoothUpdatesById = new Map(
      boothUpdateResults.filter(isFulfilled).map((r) => [r.value.id, r.value]),
    );
    const nextSavedBooths: Booth[] = [];
    for (const booth of savedBoothsRef.current) {
      if (successfulBoothDeleteIds.has(booth.id)) continue;
      nextSavedBooths.push(successfulBoothUpdatesById.get(booth.id) ?? booth);
    }
    for (const result of boothCreateResults) {
      if (isFulfilled(result)) nextSavedBooths.push(result.value.created);
    }
    savedBoothsRef.current = nextSavedBooths;

    const successfulSectionDeleteIds = new Set(
      sectionDeleteResults.filter(isFulfilled).map((r) => r.value),
    );

    setSections((current) => {
      let next = current;
      for (const result of sectionCreateResults) {
        if (isFulfilled(result)) {
          const { tempId, created } = result.value;
          next = next.map((s) => (s.id === tempId ? created : s));
        }
      }
      for (const result of sectionUpdateResults) {
        if (isFulfilled(result)) {
          const updated = result.value;
          next = next.map((s) => (s.id === updated.id ? updated : s));
        }
      }
      if (successfulSectionDeleteIds.size > 0) {
        next = next.filter((s) => !successfulSectionDeleteIds.has(s.id));
      }
      return next;
    });

    setPendingSectionCreateIds((current) => {
      const next = new Set(current);
      sectionCreateResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(sectionCreates[i].id);
      });
      return next;
    });
    setPendingSectionUpdateIds((current) => {
      const next = new Set(current);
      sectionUpdateResults.forEach((result, i) => {
        if (isFulfilled(result)) next.delete(sectionUpdates[i].id);
      });
      return next;
    });
    setPendingSectionDeleteIds((current) => {
      const next = new Set(current);
      successfulSectionDeleteIds.forEach((id) => next.delete(id));
      return next;
    });

    const successfulSectionUpdatesById = new Map(
      sectionUpdateResults.filter(isFulfilled).map((r) => [r.value.id, r.value]),
    );
    const nextSavedSections: MapSection[] = [];
    for (const section of savedSectionsRef.current) {
      if (successfulSectionDeleteIds.has(section.id)) continue;
      nextSavedSections.push(successfulSectionUpdatesById.get(section.id) ?? section);
    }
    for (const result of sectionCreateResults) {
      if (isFulfilled(result)) nextSavedSections.push(result.value.created);
    }
    savedSectionsRef.current = nextSavedSections;

    const countRejected = (results: PromiseSettledResult<unknown>[]) =>
      results.filter((r) => !isFulfilled(r)).length;
    const failures =
      countRejected(boothCreateResults) +
      countRejected(boothUpdateResults) +
      countRejected(boothDeleteResults) +
      countRejected(sectionCreateResults) +
      countRejected(sectionUpdateResults) +
      countRejected(sectionDeleteResults);

    setSavingChanges(false);
    setSaveError(
      failures > 0 ? `${failures} change${failures === 1 ? "" : "s"} couldn't be saved. Try again.` : null,
    );
  }

  async function handleBackToEvent() {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "You have booth/section changes that haven't been saved yet.",
        confirmLabel: "Discard and leave",
        tone: "danger",
      });
      if (!ok) return;
    }
    router.push(`/dashboard/admin/events/${eventId}`);
  }

  if (loading) {
    return null;
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={handleBackToEvent}
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Back to Event
        </button>

        <h1 className="text-2xl font-semibold">Floor Map — {eventName}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Click to drop a standard-size booth, drag to draw a custom size, or switch modes to mark
          category sections.
        </p>

        {pageError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {pageError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-transparent">
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

          <label className="flex items-center gap-4 text-sm font-medium">
            <button
              type="button"
              role="switch"
              aria-checked={mapVisible}
              disabled={togglingVisible || !displayImageUrl}
              onClick={handleToggleVisible}
              className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
                mapVisible ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-700"
              }`}
            >
              <span
                className={`h-5 w-5 shrink-0 rounded-full bg-white transition-transform ${
                  mapVisible ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span>Visible to visitors</span>
          </label>
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

        {!displayImageUrl && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Visibility can&apos;t be turned on until a map image is uploaded or a layout is chosen.
          </p>
        )}

        {displayImageUrl && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setDrawMode("booth")}
              className={`rounded-md border px-3 py-1.5 font-medium ${
                drawMode === "booth"
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              Place booths
            </button>
            <button
              type="button"
              onClick={() => setDrawMode("section")}
              className={`rounded-md border px-3 py-1.5 font-medium ${
                drawMode === "section"
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              Mark category sections
            </button>

            {drawMode === "booth" && (
              <div className="ml-2 flex items-center gap-1.5 border-l border-gray-300 pl-3 dark:border-gray-700">
                <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Click size
                </span>
                {(Object.keys(BOOTH_SIZE_PRESETS) as BoothSizeKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBoothSizePreset(key)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      boothSizePreset === key
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-gray-300 dark:border-gray-700"
                    }`}
                  >
                    {BOOTH_SIZE_PRESETS[key].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {displayImageUrl && (
          <div
            ref={containerRef}
            onMouseDown={onContainerMouseDown}
            className="relative mt-4 w-full select-none overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImageUrl}
              alt="Event floor map"
              draggable={false}
              className="block w-full"
            />

            {sections.map((section) => {
              const rect =
                liveRect && liveRect.target.kind === "section" && liveRect.target.id === section.id
                  ? liveRect.rect
                  : rectFrom(section);
              const isPending =
                pendingSectionCreateIds.has(section.id) || pendingSectionUpdateIds.has(section.id);
              const categoryLabel =
                CATEGORY_LABELS[section.category as VendorCategory] ?? section.category;
              const styles =
                CATEGORY_STYLES[section.category as VendorCategory] ?? "bg-gray-500/10 text-gray-600";
              return (
                <div
                  key={`section-${section.id}`}
                  onMouseDown={(e) =>
                    startDrag(e, { kind: "section", id: section.id }, "move", rectFrom(section))
                  }
                  title={`${categoryLabel} section${isPending ? " (unsaved)" : ""}`}
                  className={`absolute flex cursor-move items-start justify-start border-2 border-current p-1 ${styles} ${
                    isPending ? "border-dashed" : ""
                  }`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                  }}
                >
                  <span className="pointer-events-none rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-black/50">
                    {categoryLabel}
                  </span>
                  <div
                    onMouseDown={(e) =>
                      startDrag(e, { kind: "section", id: section.id }, "resize", rectFrom(section))
                    }
                    className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-current"
                  />
                </div>
              );
            })}

            {booths.map((booth) => {
              const rect =
                liveRect && liveRect.target.kind === "booth" && liveRect.target.id === booth.id
                  ? liveRect.rect
                  : rectFrom(booth);
              const label = booth.vendor_detail?.label || booth.unlinked_vendor_name || "Unassigned";
              const isPending = pendingCreateIds.has(booth.id) || pendingUpdateIds.has(booth.id);
              return (
                <div
                  key={booth.id}
                  onMouseDown={(e) =>
                    startDrag(e, { kind: "booth", id: booth.id }, "move", rectFrom(booth))
                  }
                  title={`Booth ${booth.booth_number} — ${label}${isPending ? " (unsaved)" : ""}`}
                  className={`absolute cursor-move rounded border-2 bg-brand-blue/20 hover:bg-brand-blue/30 ${
                    isPending ? "border-dashed border-brand-blue" : "border-brand-blue"
                  }`}
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
                  <div
                    onMouseDown={(e) =>
                      startDrag(e, { kind: "booth", id: booth.id }, "resize", rectFrom(booth))
                    }
                    className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-brand-blue"
                  />
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
              {booths.length} booth{booths.length === 1 ? "" : "s"} placed, {sections.length}{" "}
              category section{sections.length === 1 ? "" : "s"} marked. Drag a marker to move it,
              drag its corner handle to resize, or click it to edit.
            </p>
            {isDirty && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Unsaved changes
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

      {editing !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeForm}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editing === "new" ? "New booth" : `Edit booth ${editing.booth_number}`}
            </h2>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
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
                  Size
                </label>
                <div className="flex gap-2 text-sm">
                  {(Object.keys(BOOTH_SIZE_PRESETS) as BoothSizeKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyBoothSizePreset(key)}
                      className={`flex-1 rounded-md border px-3 py-1.5 font-medium ${
                        isBoothSizePresetActive(key)
                          ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                          : "border-gray-300 dark:border-gray-700"
                      }`}
                    >
                      {BOOTH_SIZE_PRESETS[key].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setAssignMode("existing")}
                  className={`flex-1 rounded-md border px-3 py-1.5 font-medium ${
                    assignMode === "existing"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  Existing vendor
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode("unlinked")}
                  className={`flex-1 rounded-md border px-3 py-1.5 font-medium ${
                    assignMode === "unlinked"
                      ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  No account
                </button>
              </div>

              {assignMode === "existing" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Vendor
                  </label>
                  {selectedVendor ? (
                    <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
                      <span>{selectedVendor.business_name || selectedVendor.email}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedVendor(null)}
                        className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        placeholder="Search vendors by name or email..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      {vendorResults.length > 0 && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800">
                          {vendorResults.map((vendor) => (
                            <button
                              key={vendor.pk}
                              type="button"
                              onClick={() => {
                                setSelectedVendor(vendor);
                                setVendorSearch("");
                                setVendorResults([]);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              {vendor.business_name || vendor.email}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      Vendor name
                    </label>
                    <input
                      type="text"
                      value={unlinkedName}
                      onChange={(e) => setUnlinkedName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      Category
                    </label>
                    <select
                      value={unlinkedCategory}
                      onChange={(e) => setUnlinkedCategory(e.target.value as VendorCategory)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      Contact (admin reference only, not shown publicly)
                    </label>
                    <input
                      type="text"
                      value={unlinkedContact}
                      onChange={(e) => setUnlinkedContact(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                  </div>
                </>
              )}

              {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

              <div className="flex items-center justify-between gap-2">
                <div>
                  {editing !== "new" && (
                    <button
                      type="button"
                      onClick={handleDeleteBooth}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeForm}
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
              {editingSection === "new" ? "New category section" : "Edit category section"}
            </h2>

            <form onSubmit={handleSectionFormSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Category
                </label>
                <select
                  value={sectionCategory}
                  onChange={(e) => setSectionCategory(e.target.value as VendorCategory)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
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
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
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
    </main>
  );
}
