"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthPageSpinner } from "@/components/AuthPageSpinner";
import { ArticleBody } from "@/components/ArticleBody";
import { apiFetch } from "@/lib/api";
import { formatArticleDate, type ArticleDetail } from "@/lib/articles";

export default function ArticleDetailPage() {
  const params = useParams<{ articleSlug: string }>();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ArticleDetail>(`/articles/${params.articleSlug}/`)
      .then((data) => {
        if (!cancelled) setArticle(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.articleSlug]);

  if (loading) {
    return <AuthPageSpinner />;
  }

  if (notFound || !article) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Article not found</h1>
        <Link href="/articles" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all articles
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <article className="mx-auto max-w-3xl">
        <Link href="/articles" className="text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to all articles
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
        {article.summary && (
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-300">{article.summary}</p>
        )}

        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {article.author_name && <span>{article.author_name}</span>}
          {article.author_name && article.published_at && <span>&middot;</span>}
          {article.published_at && <span>{formatArticleDate(article.published_at)}</span>}
        </div>

        {article.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-xs font-medium text-brand-blue"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {article.cover_image_url && (
          // Backend-served image from a dynamic host, same convention as
          // ArticleCard/the venue floor-map image rather than next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="mt-8 w-full rounded-lg object-cover"
          />
        )}

        <div className="mt-8">
          <ArticleBody blocks={article.body} />
        </div>
      </article>
    </main>
  );
}
