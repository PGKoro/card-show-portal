import Link from "next/link";

import { formatArticleDate, type ArticleSummary } from "@/lib/articles";

export function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
    >
      {article.cover_image_url ? (
        // Backend-served image from a dynamic host, same convention as the
        // venue floor-map image (admin/venues/[venueId]/page.tsx) rather
        // than next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.cover_image_url}
          alt={article.title}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="h-44 w-full bg-gray-100 dark:bg-gray-900" aria-hidden="true" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-semibold group-hover:underline">{article.title}</h3>
        {article.summary && (
          <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
            {article.summary}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-gray-500 dark:text-gray-400">
          {article.author_name && <span>{article.author_name}</span>}
          {article.author_name && article.published_at && <span>&middot;</span>}
          {article.published_at && <span>{formatArticleDate(article.published_at)}</span>}
        </div>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
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
      </div>
    </Link>
  );
}
