"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArticleEditor } from "@/components/ArticleEditor";
import type { AdminArticle } from "@/lib/articles";

export default function NewArticlePage() {
  const router = useRouter();

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard/admin/articles"
          className="mb-4 inline-block text-sm font-medium text-brand-blue hover:underline"
        >
          ← Article Creator
        </Link>
        <h1 className="mb-6 text-2xl font-semibold">New Article</h1>

        <ArticleEditor
          initialArticle={null}
          onSaved={(article: AdminArticle) => {
            router.replace(`/dashboard/admin/articles/${article.id}`);
          }}
        />
      </div>
    </main>
  );
}
