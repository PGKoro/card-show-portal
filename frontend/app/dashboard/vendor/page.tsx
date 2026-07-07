"use client";

import { useRef, useState, type FormEvent } from "react";

import { InventoryCard } from "@/components/InventoryCard";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  getItemById,
  getItemsByVendor,
  getVendorById,
  type InventoryCondition,
  type InventoryItem,
  type VendorCategory,
} from "@/lib/mockData";

// Demo persona: pretend the logged-in vendor is Diamond Dynasty Cards.
const MY_VENDOR_ID = "diamond-dynasty";
const CATEGORIES = Object.keys(CATEGORY_LABELS) as VendorCategory[];
const CONDITIONS = Object.keys(CONDITION_LABELS) as InventoryCondition[];

export default function VendorDashboardPage() {
  const vendor = getVendorById(MY_VENDOR_ID);
  const [items, setItems] = useState<InventoryItem[]>(getItemsByVendor(MY_VENDOR_ID));
  const [formOpen, setFormOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VendorCategory>("modern");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<InventoryCondition>("near-mint");
  const [description, setDescription] = useState("");
  const nextItemId = useRef(0);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const newItem: InventoryItem = {
      id: `my-item-${nextItemId.current++}`,
      vendorId: MY_VENDOR_ID,
      category,
      title: title || "Untitled item",
      price: Number(price) || 0,
      condition,
      status: "available",
      description: description || "No description provided.",
    };

    // In-memory only — this list resets on page refresh, nothing is saved
    // to a real database.
    setItems((current) => [newItem, ...current]);
    setJustAdded(newItem.title);
    setFormOpen(false);
    setTitle("");
    setPrice("");
    setDescription("");
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">My Inventory</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Viewing as {vendor?.businessName ?? "your shop"} (demo persona)
            </p>
          </div>
          <button
            onClick={() => {
              setFormOpen((v) => !v);
              setJustAdded(null);
            }}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            {formOpen ? "Close" : "Add Item"}
          </button>
        </div>

        {justAdded && (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            &ldquo;{justAdded}&rdquo; added to your inventory (demo only — not saved to a real database).
          </div>
        )}

        {formOpen && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 dark:border-gray-800"
          >
            <div className="sm:col-span-2">
              <label htmlFor="title" className="block text-sm font-medium">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 2024 Bowman Chrome Rookie Auto"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as VendorCategory)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="condition" className="block text-sm font-medium">
                Condition
              </label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as InventoryCondition)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="price" className="block text-sm font-medium">
                Price ($)
              </label>
              <input
                id="price"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy"
              >
                Save Item
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              href={getItemById(item.id) ? `/vendors/${MY_VENDOR_ID}/items/${item.id}` : undefined}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
