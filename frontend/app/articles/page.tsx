"use client";

import { useEffect, useState } from "react";

import { ArticleCard } from "@/components/ArticleCard";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import type { ArticleSummary } from "@/lib/articles";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<ArticleSummary>>("/articles/")
      .then((data) => {
        if (!cancelled) setArticles(data.results);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          News, recaps, and updates from the Collectors Village team.
        </p>

        <div className="mt-10">
          {loading ? (
            <Spinner />
          ) : error ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Could not load articles. Please try again later.
            </p>
          ) : articles.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No articles published yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
