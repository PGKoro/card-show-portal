"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useCategories, type Category } from "@/lib/CategoriesContext";

export default function ManageCategoriesPage() {
  const { categories, isLoading, refresh } = useCategories();
  const confirm = useConfirm();

  // Drag-and-drop and the up/down buttons both just reorder this local id
  // list — nothing hits the network until "Save changes" is clicked, so
  // rearranging a long list doesn't fire a request per move. `isDirty`
  // tracks whether the admin has an in-progress rearrangement so a
  // background refresh (from an unrelated add/rename/delete) doesn't
  // clobber it. Synced from `categories` during render rather than in an
  // effect — this is React's documented "adjusting state when a prop
  // changes" pattern, guarded by the `prevCategories` comparison below so
  // it only runs once per actual change instead of looping.
  const [draftOrderIds, setDraftOrderIds] = useState<number[]>(() =>
    categories.map((c) => c.id),
  );
  const [prevCategories, setPrevCategories] = useState(categories);
  const [isDirty, setIsDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  if (categories !== prevCategories) {
    setPrevCategories(categories);
    const serverIds = categories.map((c) => c.id);
    if (!isDirty) {
      setDraftOrderIds(serverIds);
    } else {
      // A create/rename/delete happened while a drag was pending — keep
      // the pending arrangement, just drop any id that's gone and append
      // any that are new, rather than discarding the in-progress
      // rearrangement.
      setDraftOrderIds((current) => {
        const serverSet = new Set(serverIds);
        const kept = current.filter((id) => serverSet.has(id));
        const keptSet = new Set(kept);
        const added = serverIds.filter((id) => !keptSet.has(id));
        return [...kept, ...added];
      });
    }
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const displayCategories = draftOrderIds
    .map((id) => categoryById.get(id))
    .filter((c): c is Category => !!c);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch<Category>("/admin/categories/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { name: newName.trim() },
      });
      setNewName("");
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create category."));
    } finally {
      setCreating(false);
    }
  }

  function startRename(category: Category) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function submitRename(id: number) {
    if (!renameValue.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      await apiFetch<Category>(`/admin/categories/${id}/`, {
        method: "PATCH",
        accessToken: getAccessToken() ?? undefined,
        body: { name: renameValue.trim() },
      });
      setRenamingId(null);
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not rename category."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(category: Category) {
    const ok = await confirm({
      title: "Delete this category?",
      message: `"${category.name}" will no longer be selectable anywhere on the site. Existing vendors/listings that already used it keep showing it, but it won't be offered for new ones.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(category.id);
    setError(null);
    try {
      await apiFetch(`/admin/categories/${category.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete category."));
    } finally {
      setBusyId(null);
    }
  }

  function reorderLocally(id: number, targetIndex: number) {
    setDraftOrderIds((current) => {
      const fromIndex = current.indexOf(id);
      if (fromIndex === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, id);
      return next;
    });
    setIsDirty(true);
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
    const targetIndex = draftOrderIds.indexOf(targetId);
    reorderLocally(draggedId, targetIndex);
    setDraggedId(null);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    setOrderError(null);
    try {
      await apiFetch("/admin/categories/reorder/", {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
        body: { order: draftOrderIds },
      });
      setIsDirty(false);
      refresh();
    } catch (err) {
      setOrderError(getApiErrorMessage(err, "Could not save the new order."));
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDiscardOrder() {
    setIsDirty(false);
    setDraftOrderIds(categories.map((c) => c.id));
    setOrderError(null);
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <h1 className="mb-1 text-2xl font-semibold">Manage Categories</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          These categories power the tag pickers on onboarding, Browse Vendors, Browse Cards, and
          the Add Item form across the whole site. Drag a row (or use the arrows) to reorder, then
          save your changes.
        </p>

        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {isDirty && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
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
                {savingOrder ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {orderError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {orderError}
          </p>
        )}

        {!isLoading && displayCategories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No categories yet — add one above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {displayCategories.map((category, index) => (
              <li
                key={category.id}
                draggable
                onDragStart={() => setDraggedId(category.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(category.id)}
                className={`flex items-center gap-3 p-4 ${
                  draggedId === category.id ? "opacity-40" : ""
                }`}
              >
                <span
                  className="cursor-grab select-none text-gray-300 dark:text-gray-600"
                  aria-hidden="true"
                >
                  ⠿
                </span>

                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMoveButton(category.id, "up")}
                    className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                    aria-label={`Move ${category.name} up`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={index === displayCategories.length - 1}
                    onClick={() => handleMoveButton(category.id, "down")}
                    className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                    aria-label={`Move ${category.name} down`}
                  >
                    ▼
                  </button>
                </div>

                <div className="flex-1">
                  {renamingId === category.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => submitRename(category.id)}
                        disabled={busyId === category.id}
                        className="rounded-md bg-brand-blue px-3 py-1 text-xs font-medium text-white hover:bg-brand-navy disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium">{category.name}</span>
                  )}
                </div>

                {renamingId !== category.id && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startRename(category)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busyId === category.id}
                      onClick={() => handleDelete(category)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
