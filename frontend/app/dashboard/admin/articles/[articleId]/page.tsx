"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { ArticleEditor } from "@/components/ArticleEditor";
import { useConfirm } from "@/components/ConfirmDialogProvider";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { AdminArticle } from "@/lib/articles";

export default function EditArticlePage() {
  const params = useParams<{ articleId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [article, setArticle] = useState<AdminArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    apiFetch<AdminArticle>(`/admin/articles/${params.articleId}/`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => setArticle(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.articleId]);

  async function runAction(action: "publish" | "unpublish" | "archive" | "restore") {
    setActionBusy(true);
    setActionError(null);
    try {
      const updated = await apiFetch<AdminArticle>(
        `/admin/articles/${params.articleId}/${action}/`,
        { method: "POST", accessToken: getAccessToken() ?? undefined },
      );
      setArticle(updated);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not update this article."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!article) return;
    const ok = await confirm({
      title: "Permanently delete this article?",
      message: `"${article.title}" and all of its content will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (!ok) return;

    setActionBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/admin/articles/${article.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      router.replace("/dashboard/admin/articles");
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not delete this article."));
      setActionBusy(false);
    }
  }

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (notFound || !article) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Article not found</h1>
        <Link
          href="/dashboard/admin/articles"
          className="mt-4 text-sm font-medium text-brand-blue hover:underline"
        >
          &larr; Back to Article Creator
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/admin/articles"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Article Creator
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Edit Article</h1>
          <div className="flex flex-wrap gap-2">
            {!article.archived && article.status === "draft" && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction("publish")}
                className="rounded-md border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950"
              >
                Publish
              </button>
            )}
            {!article.archived && article.status === "published" && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction("unpublish")}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                Unpublish
              </button>
            )}
            {!article.archived ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction("archive")}
                className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                Archive
              </button>
            ) : (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction("restore")}
                className="rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
              >
                Restore
              </button>
            )}
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete
            </button>
          </div>
        </div>

        {actionError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {actionError}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-0.5 font-medium ${
              article.archived
                ? "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                : article.status === "published"
                  ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {article.archived ? "Archived" : article.status === "published" ? "Published" : "Draft"}
          </span>
          {article.status === "published" && !article.archived && (
            <a
              href={`/articles/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-blue hover:underline"
            >
              View live →
            </a>
          )}
        </div>

        <ArticleEditor initialArticle={article} onSaved={(updated) => setArticle(updated)} />
      </div>
    </main>
  );
}
