// app/admin/erp/articles/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpArticle = {
  id: string;

  sku: string;
  title: string | null;
  category: string | null;

  active: boolean | null;
  published: boolean | null;
  refurbished_product: boolean | null;
  vat_margin: boolean | null;

  inventory_qty: number | null;

  stock_gentbrugge: number | null;
  stock_oudenaarde: number | null;
  stock_antwerpen: number | null;

  price_cents: number | null;
  compare_price_cents: number | null;

  updated_at: string | null;
};

function money(cents: number | null) {
  if (typeof cents !== "number") {
    return "—";
  }

  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

async function getArticles(
  query?: string
): Promise<ErpArticle[]> {
  let q = supabaseAdmin
    .from("erp_articles")
    .select(`
      id,
      sku,
      title,
      category,
      active,
      published,
      refurbished_product,
      vat_margin,
      inventory_qty,
      stock_gentbrugge,
      stock_oudenaarde,
      stock_antwerpen,
      price_cents,
      compare_price_cents,
      updated_at
    `)
    .order("updated_at", {
      ascending: false,
    })
    .limit(250);

  if (query?.trim()) {
    q = q.or(
      `sku.ilike.%${query}%,title.ilike.%${query}%`
    );
  }

  const { data, error } = await q;

  if (error) {
    console.error(
      "[ERP ARTICLES] fetch error",
      error
    );

    return [];
  }

  return data as ErpArticle[];
}

export default async function ErpArticlesPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
  };
}) {
  const query = String(searchParams?.q || "").trim();

  const articles = await getArticles(query);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.25),transparent_30%)]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-200 backdrop-blur">
              ERP Artikeldatabase
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight">
              Centrale ERP artikels
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Live gesynchroniseerde ERP/Shopify
              artikeldatabase voor refurb, leads,
              labels en stockbeheer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Artikelen
              </div>

              <div className="mt-2 text-2xl font-bold">
                {articles.length}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Refurb
              </div>

              <div className="mt-2 text-2xl font-bold">
                {
                  articles.filter(
                    (a) =>
                      a.refurbished_product
                  ).length
                }
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Actief
              </div>

              <div className="mt-2 text-2xl font-bold">
                {
                  articles.filter(
                    (a) => a.active
                  ).length
                }
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Voorraad
              </div>

              <div className="mt-2 text-2xl font-bold">
                {articles.reduce(
                  (sum, a) =>
                    sum +
                    (a.inventory_qty || 0),
                  0
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TOPBAR */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <form className="flex flex-1 gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Zoek op SKU of titel..."
            className="w-full rounded-xl border px-4 py-2 text-sm"
          />

          <button
            type="submit"
            className="bb-btn bb-btn-primary text-sm"
          >
            Zoeken
          </button>
        </form>

        <div className="flex gap-2">
          <Link
            href="/admin/erp/sync"
            className="bb-btn text-sm"
          >
            Sync
          </Link>

          <Link
            href="/admin/erp/import"
            className="bb-btn text-sm"
          >
            Import
          </Link>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  SKU
                </th>

                <th className="px-4 py-3 text-left">
                  Titel
                </th>

                <th className="px-4 py-3 text-left">
                  Type
                </th>

                <th className="px-4 py-3 text-left">
                  Voorraad
                </th>

                <th className="px-4 py-3 text-left">
                  Locaties
                </th>

                <th className="px-4 py-3 text-left">
                  Prijs
                </th>

                <th className="px-4 py-3 text-left">
                  Status
                </th>

                <th className="px-4 py-3 text-left">
                  Update
                </th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr
                  key={article.id}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs font-semibold text-slate-900">
                      {article.sku}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-900">
                      {article.title || "—"}
                    </div>

                    {article.refurbished_product && (
                      <div className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        Refurb
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-700">
                      {article.category || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        (article.inventory_qty || 0) >
                        0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {article.inventory_qty || 0}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1 text-xs">
                      <div>
                        Gentbrugge:{" "}
                        <b>
                          {article.stock_gentbrugge ||
                            0}
                        </b>
                      </div>

                      <div>
                        Oudenaarde:{" "}
                        <b>
                          {article.stock_oudenaarde ||
                            0}
                        </b>
                      </div>

                      <div>
                        Antwerpen:{" "}
                        <b>
                          {article.stock_antwerpen ||
                            0}
                        </b>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">
                      {money(
                        article.price_cents
                      )}
                    </div>

                    {article.compare_price_cents && (
                      <div className="text-xs text-slate-400 line-through">
                        {money(
                          article.compare_price_cents
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {article.active ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">
                          Actief
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700">
                          Inactief
                        </span>
                      )}

                      {article.published && (
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-700">
                          Published
                        </span>
                      )}

                      {article.vat_margin && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                          Margin VAT
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top text-xs text-slate-500">
                    {article.updated_at
                      ? new Date(
                          article.updated_at
                        ).toLocaleString(
                          "nl-BE"
                        )
                      : "—"}
                  </td>
                </tr>
              ))}

              {articles.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Geen artikelen gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
