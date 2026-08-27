"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CollectionsBreadcrumbs } from "@/components/CollectionsBreadcrumbs";
import { NumberedPagination } from "@/components/NumberedPagination";
import { SearchInput } from "@/components/SearchInput";
import { Spinner } from "@/components/Spinner";
import { apiFetch, type PaginatedResponse } from "@/lib/api";
import { useCategories } from "@/lib/CategoriesContext";
import type { CardSetSummary, Company } from "@/lib/collections";

// Category -> Year -> Company -> Sets all live on this one route, each
// depth added as a query param (?year=&company=) rather than separate
// nested routes — narrowing a step is just adding a param, and going
// "back" a step is just dropping one, which keeps the breadcrumb/back
// behavior simple and avoids a page per depth for what's really one
// progressively-filtered set browser.
export default function CategoryCollectionsPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories, labelFor, isLoading: categoriesLoading } = useCategories();

  const yearParam = searchParams.get("year");
  const companyParam = searchParams.get("company");
  const searchParam = searchParams.get("search") ?? "";
  const pageParam = Number(searchParams.get("page") ?? "1") || 1;

  const [years, setYears] = useState<number[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sets, setSets] = useState<PaginatedResponse<CardSetSummary> | null>(null);
  const [search, setSearch] = useState(searchParam);
  const [loading, setLoading] = useState(true);

  const categoryExists = categories.some((c) => c.slug === categorySlug);

  function updateParams(next: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    router.push(`/collections/${categorySlug}?${params.toString()}`);
  }

  useEffect(() => {
    if (!categorySlug) return;
    apiFetch<number[]>(`/collections/years/?category=${categorySlug}`).then(setYears);
  }, [categorySlug]);

  useEffect(() => {
    if (!categorySlug || !yearParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanies([]);
      return;
    }
    apiFetch<Company[]>(`/collections/companies/?category=${categorySlug}&year=${yearParam}`).then(
      setCompanies,
    );
  }, [categorySlug, yearParam]);

  useEffect(() => {
    if (!categorySlug) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams();
    params.set("category", categorySlug);
    params.set("page", String(pageParam));
    if (yearParam) params.set("year", yearParam);
    if (companyParam) params.set("company", companyParam);
    if (searchParam) params.set("search", searchParam);
    apiFetch<PaginatedResponse<CardSetSummary>>(`/collections/sets/?${params.toString()}`)
      .then(setSets)
      .finally(() => setLoading(false));
  }, [categorySlug, yearParam, companyParam, searchParam, pageParam]);

  const selectedCompany = companies.find((c) => String(c.id) === companyParam);

  const breadcrumbs = [
    { label: "Collections", href: "/collections" },
    { label: labelFor(categorySlug), href: `/collections/${categorySlug}` },
    ...(yearParam
      ? [{ label: String(yearParam), href: `/collections/${categorySlug}?year=${yearParam}` }]
      : []),
    ...(selectedCompany
      ? [
          {
            label: selectedCompany.name,
            href: `/collections/${categorySlug}?year=${yearParam}&company=${companyParam}`,
          },
        ]
      : []),
  ];

  if (categoriesLoading) return <Spinner />;

  if (!categoryExists) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Category not found</h1>
        <Link href="/collections" className="mt-4 text-sm font-medium text-brand-blue hover:underline">
          &larr; Back to Collections
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <CollectionsBreadcrumbs items={breadcrumbs} />
        <h1 className="mb-6 text-2xl font-semibold">{labelFor(categorySlug)}</h1>

        {!yearParam && (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Year</h2>
            {years.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No sets found for this category yet.
              </p>
            ) : (
              <div className="mb-8 flex flex-wrap gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    onClick={() => updateParams({ year, company: null, page: null })}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {yearParam && !companyParam && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                {yearParam} Companies
              </h2>
              <button
                onClick={() => updateParams({ year: null, page: null })}
                className="text-sm font-medium text-brand-blue hover:underline"
              >
                Change year
              </button>
            </div>
            {companies.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No companies found for this selection.
              </p>
            ) : (
              <div className="mb-8 flex flex-wrap gap-2">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => updateParams({ company: company.id, page: null })}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {company.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {yearParam && companyParam && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Sets</h2>
            <button
              onClick={() => updateParams({ company: null, page: null })}
              className="text-sm font-medium text-brand-blue hover:underline"
            >
              Change company
            </button>
          </div>
        )}

        {(yearParam || search) && (
          <div className="mb-6">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                updateParams({ search: value || null, page: null });
              }}
              placeholder="Search sets by name or company..."
            />
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : !sets || sets.results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No sets found for this selection.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sets.results.map((set) => (
                <Link
                  key={set.id}
                  href={`/collections/sets/${set.id}`}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {set.year} {set.company_name} {set.name}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {set.card_count} card{set.card_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <NumberedPagination
              page={pageParam}
              totalPages={Math.ceil(sets.count / 10)}
              onChange={(page) => updateParams({ page })}
            />
          </>
        )}
      </div>
    </main>
  );
}
