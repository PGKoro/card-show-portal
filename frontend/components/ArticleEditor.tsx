"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { ArticleBody } from "@/components/ArticleBody";
import { apiFetchMultipart, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { AdminArticle, ArticleBodyBlock } from "@/lib/articles";

type EditableBlock = ArticleBodyBlock & { key: string };

let blockKeyCounter = 0;
function nextBlockKey() {
  blockKeyCounter += 1;
  return `block-${blockKeyCounter}`;
}

function toEditableBlocks(blocks: ArticleBodyBlock[]): EditableBlock[] {
  return blocks.map((block) => ({ ...block, key: nextBlockKey() }));
}

function blankBlock(type: ArticleBodyBlock["type"]): EditableBlock {
  const key = nextBlockKey();
  if (type === "bulleted_list" || type === "numbered_list") {
    return { key, type, items: [""] };
  }
  return { key, type, text: "" };
}

export type ArticleFormValues = {
  title: string;
  summary: string;
  author_name: string;
  tags: string[];
  body: ArticleBodyBlock[];
};

/**
 * Shared create/edit form for Article Creator. Handles its own field
 * state and image upload, but delegates the actual save (draft vs.
 * publish, create vs. update) to the caller via onSave — the new-article
 * and edit-article pages differ only in what happens after a successful
 * save and which lifecycle buttons are shown, not in the fields
 * themselves.
 */
export function ArticleEditor({
  initialArticle,
  onSaved,
}: {
  initialArticle: AdminArticle | null;
  onSaved: (article: AdminArticle) => void;
}) {
  const [title, setTitle] = useState(initialArticle?.title ?? "");
  const [summary, setSummary] = useState(initialArticle?.summary ?? "");
  const [authorName, setAuthorName] = useState(initialArticle?.author_name ?? "");
  const [tags, setTags] = useState<string[]>(initialArticle?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    toEditableBlocks(initialArticle?.body ?? [{ type: "paragraph", text: "" }]),
  );
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string | null>(
    initialArticle?.cover_image_url ?? null,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  function addTag() {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput("");
      return;
    }
    setTags([...tags, value]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleCoverImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCoverImageFile(file);
    if (file) {
      setCoverImagePreviewUrl(URL.createObjectURL(file));
    }
  }

  function addBlock(type: ArticleBodyBlock["type"]) {
    setBlocks([...blocks, blankBlock(type)]);
  }

  function removeBlock(key: string) {
    setBlocks(blocks.filter((b) => b.key !== key));
  }

  function moveBlock(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setBlocks(next);
  }

  function updateBlockText(key: string, text: string) {
    setBlocks(
      blocks.map((b) => (b.key === key && (b.type === "heading" || b.type === "paragraph") ? { ...b, text } : b)),
    );
  }

  function updateListItem(key: string, itemIndex: number, value: string) {
    setBlocks(
      blocks.map((b) => {
        if (b.key !== key || (b.type !== "bulleted_list" && b.type !== "numbered_list")) return b;
        const items = [...b.items];
        items[itemIndex] = value;
        return { ...b, items };
      }),
    );
  }

  function addListItem(key: string) {
    setBlocks(
      blocks.map((b) => {
        if (b.key !== key || (b.type !== "bulleted_list" && b.type !== "numbered_list")) return b;
        return { ...b, items: [...b.items, ""] };
      }),
    );
  }

  function removeListItem(key: string, itemIndex: number) {
    setBlocks(
      blocks.map((b) => {
        if (b.key !== key || (b.type !== "bulleted_list" && b.type !== "numbered_list")) return b;
        return { ...b, items: b.items.filter((_, i) => i !== itemIndex) };
      }),
    );
  }

  // Wraps or inserts markup at the textarea's current selection — the
  // toolbar's Bold/Italic/Link buttons. Falls back to appending at the
  // end if the selection can't be read (shouldn't normally happen).
  function applyInlineMarkup(key: string, before: string, after: string, placeholder: string) {
    const textarea = textareaRefs.current[key];
    const block = blocks.find((b) => b.key === key);
    if (!block || (block.type !== "heading" && block.type !== "paragraph")) return;
    const start = textarea?.selectionStart ?? block.text.length;
    const end = textarea?.selectionEnd ?? block.text.length;
    const selected = block.text.slice(start, end) || placeholder;
    const nextText = block.text.slice(0, start) + before + selected + after + block.text.slice(end);
    updateBlockText(key, nextText);
  }

  function buildFormValues(): ArticleFormValues {
    return {
      title: title.trim(),
      summary: summary.trim(),
      author_name: authorName.trim(),
      tags,
      body: blocks.map(({ key: _key, ...block }) => block) as ArticleBodyBlock[],
    };
  }

  async function handleSave(overrides: Partial<{ status: "draft" | "published" }> = {}) {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const values = buildFormValues();
      const formData = new FormData();
      formData.append("title", values.title);
      formData.append("summary", values.summary);
      formData.append("author_name", values.author_name);
      formData.append("tags", JSON.stringify(values.tags));
      formData.append("body", JSON.stringify(values.body));
      if (overrides.status) formData.append("status", overrides.status);
      if (coverImageFile) formData.append("cover_image", coverImageFile);

      const isEditing = !!initialArticle;
      const article = await apiFetchMultipart<AdminArticle>(
        isEditing ? `/admin/articles/${initialArticle.id}/` : "/admin/articles/",
        formData,
        {
          method: isEditing ? "PATCH" : "POST",
          accessToken: getAccessToken() ?? undefined,
        },
      );
      setSuccess(isEditing ? "Article saved." : "Draft created.");
      setCoverImageFile(null);
      onSaved(article);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this article."));
    } finally {
      setSaving(false);
    }
  }

  const previewValues = buildFormValues();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <div>
        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            {success}
          </p>
        )}

        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Subheadline / summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Author / publisher name</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Publish date</label>
              <input
                type="text"
                readOnly
                value={
                  initialArticle?.published_at
                    ? new Date(initialArticle.published_at).toLocaleString()
                    : "Not published yet"
                }
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Featured / cover image</label>
            {coverImagePreviewUrl && (
              // Backend-served (or local object URL preview) image — same
              // convention as ArticleCard rather than next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImagePreviewUrl}
                alt="Cover preview"
                className="mb-2 h-40 w-full rounded-md object-cover"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleCoverImageChange}
              className="block w-full text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              JPEG, PNG, WEBP, or GIF — max 8MB.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="text-brand-blue/70 hover:text-brand-blue"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Type a tag and press Enter"
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <label className="block text-sm font-medium">Article body</label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>

          <div className="space-y-4">
            {blocks.map((block, index) => (
              <div key={block.key} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {block.type === "heading" && "Heading"}
                    {block.type === "paragraph" && "Paragraph"}
                    {block.type === "bulleted_list" && "Bulleted list"}
                    {block.type === "numbered_list" && "Numbered list"}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveBlock(index, "up")}
                      className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                      aria-label="Move block up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(index, "down")}
                      className="text-gray-400 hover:text-brand-blue disabled:opacity-30"
                      aria-label="Move block down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.key)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove block"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {(block.type === "heading" || block.type === "paragraph") && (
                  <>
                    <div className="mb-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => applyInlineMarkup(block.key, "**", "**", "bold text")}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInlineMarkup(block.key, "*", "*", "italic text")}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs italic hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInlineMarkup(block.key, "[", "](https://)", "link text")}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs underline hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      >
                        Link
                      </button>
                    </div>
                    <textarea
                      ref={(el) => {
                        textareaRefs.current[block.key] = el;
                      }}
                      value={block.text}
                      onChange={(e) => updateBlockText(block.key, e.target.value)}
                      rows={block.type === "heading" ? 1 : 4}
                      placeholder={block.type === "heading" ? "Heading text" : "Paragraph text"}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
                    />
                  </>
                )}

                {(block.type === "bulleted_list" || block.type === "numbered_list") && (
                  <div className="space-y-2">
                    {block.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => updateListItem(block.key, itemIndex, e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => removeListItem(block.key, itemIndex)}
                          className="text-gray-400 hover:text-red-600"
                          aria-label="Remove item"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem(block.key)}
                      className="text-xs font-medium text-brand-blue hover:underline"
                    >
                      + Add item
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addBlock("heading")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              + Heading
            </button>
            <button
              type="button"
              onClick={() => addBlock("paragraph")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              + Paragraph
            </button>
            <button
              type="button"
              onClick={() => addBlock("bulleted_list")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              + Bulleted list
            </button>
            <button
              type="button"
              onClick={() => addBlock("numbered_list")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              + Numbered list
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave({ status: "published" })}
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            {saving ? "Saving…" : initialArticle?.status === "published" ? "Save & keep published" : "Save & publish"}
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Approximate public preview
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{previewValues.title || "(Untitled)"}</h1>
          {previewValues.summary && (
            <p className="mt-2 text-base text-gray-600 dark:text-gray-300">{previewValues.summary}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {previewValues.author_name && <span>{previewValues.author_name}</span>}
          </div>
          {previewValues.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {previewValues.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {coverImagePreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImagePreviewUrl}
              alt="Cover preview"
              className="mt-6 w-full rounded-lg object-cover"
            />
          )}
          <div className="mt-6">
            <ArticleBody blocks={previewValues.body} />
          </div>
        </div>
      )}
    </div>
  );
}
