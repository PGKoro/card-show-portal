"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialogProvider";
import { Spinner } from "@/components/Spinner";
import { apiFetch, getApiErrorMessage } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatArticleDate, formatArticleDateTime, type AdminArticle } from "@/lib/articles";

type StatusFilter = "" | "draft" | "published";
type ArchivedFilter = "" | "0" | "1";

function StatusBadge({ article }: { article: AdminArticle }) {
  if (article.archived) {
    return (
      <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        Archived
      </span>
    );
  }
  if (article.status === "published") {
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
        Published
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Draft
    </span>
  );
}

export default function ArticleCreatorPage() {
  const confirm = useConfirm();
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("");

  function refresh() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (archivedFilter) params.set("archived", archivedFilter);
    apiFetch<AdminArticle[]>(`/admin/articles/?${params.toString()}`, {
      accessToken: getAccessToken() ?? undefined,
    })
      .then((data) => {
        setArticles(data);
        setLoadError(null);
      })
      .catch((err) => setLoadError(getApiErrorMessage(err, "Could not load articles.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, archivedFilter]);

  async function runAction(article: AdminArticle, action: "publish" | "unpublish" | "archive" | "restore") {
    setBusyId(article.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/admin/articles/${article.id}/${action}/`, {
        method: "POST",
        accessToken: getAccessToken() ?? undefined,
      });
      const messages: Record<typeof action, string> = {
        publish: "Article published.",
        unpublish: "Article moved back to draft.",
        archive: "Article archived and removed from the public site.",
        restore: "Article restored.",
      };
      setActionSuccess(messages[action]);
      refresh();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not update this article."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(article: AdminArticle) {
    const ok = await confirm({
      title: "Permanently delete this article?",
      message: `"${article.title}" and all of its content will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(article.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/admin/articles/${article.id}/`, {
        method: "DELETE",
        accessToken: getAccessToken() ?? undefined,
      });
      setActionSuccess("Article permanently deleted.");
      refresh();
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not delete this article."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/admin"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Admin Tools
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-2xl font-semibold">Article Creator</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create, edit, publish, and archive articles for the public Articles page.
            </p>
          </div>
          <Link
            href="/dashboard/admin/articles/new"
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
          >
            + New Article
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, or summary..."
            className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select
            value={archivedFilter}
            onChange={(e) => setArchivedFilter(e.target.value as ArchivedFilter)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          >
            <option value="">Archived + active</option>
            <option value="0">Active only</option>
            <option value="1">Archived only</option>
          </select>
        </div>

        {actionError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {actionError}
          </p>
        )}
        {actionSuccess && (
          <p className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            {actionSuccess}
          </p>
        )}

        {isLoading ? (
          <Spinner />
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : articles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No articles match these filters.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800">
            {articles.map((article) => (
              <li key={article.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/admin/articles/${article.id}`}
                      className="font-semibold hover:underline"
                    >
                      {article.title}
                    </Link>
                    <StatusBadge article={article} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {article.author_name || "No author set"}
                    {article.published_at && ` · Published ${formatArticleDate(article.published_at)}`}
                    {` · Last edited ${formatArticleDateTime(article.updated_at)}`}
                  </p>
                  {article.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {article.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/admin/articles/${article.id}`}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    Edit
                  </Link>
                  {!article.archived && article.status === "draft" && (
                    <button
                      type="button"
                      disabled={busyId === article.id}
                      onClick={() => runAction(article, "publish")}
                      className="rounded-md border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950"
                    >
                      Publish
                    </button>
                  )}
                  {!article.archived && article.status === "published" && (
                    <button
                      type="button"
                      disabled={busyId === article.id}
                      onClick={() => runAction(article, "unpublish")}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                    >
                      Unpublish
                    </button>
                  )}
                  {!article.archived ? (
                    <button
                      type="button"
                      disabled={busyId === article.id}
                      onClick={() => runAction(article, "archive")}
                      className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === article.id}
                      onClick={() => runAction(article, "restore")}
                      className="rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === article.id}
                    onClick={() => handleDelete(article)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
