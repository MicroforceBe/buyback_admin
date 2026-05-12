// app/admin/erp/articles/page.tsx

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpArticle = {
  id: string;
  sku: string;
  title: string | null;
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
  core_assortment: boolean | null;
};

const PAGE_SIZE = 100;

function money(cents: number | null) {
  if (typeof cents !== "number") return "—";

  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

function p(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function deriveGrade(title: string | null) {
  const t = title || "";

  if (t.includes("5*")) return "5*";
  if (t.includes("4*")) return "4*";
  if (t.includes("3*")) return "3*";

  return "—";
}

async function toggleCoreAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  const current = String(formData.get("current") || "") === "true";

  if (!id) return;

  await supabaseAdmin
    .from("erp_articles")
    .update({
      core_assortment: !current,
    })
    .eq("id", id);

  revalidatePath("/admin/erp/articles");
}

async function getArticles(params: any) {
  const from = (params.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabaseAdmin
    .from("erp_articles")
    .select(
      `
      id,
      sku,
      title,
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
      core_assortment
    `,
      { count: "exact" }
    )
    .order("sku", { ascending: false })
    .range(from, to);

  if (params.q) {
    query = query.or(`sku.ilike.%${params.q}%,title.ilike.%${params.q}%`);
  }

  if (params.status === "inactive") {
    query = query.eq("active", false);
  } else if (params.status !== "all") {
    query = query.eq("active", true);
  }

  if (params.grade === "3") query = query.ilike("title", "%3*%");
  if (params.grade === "4") query = query.ilike("title", "%4*%");
  if (params.grade === "5") query = query.ilike("title", "%5*%");

  if (params.stock === "in_stock") query = query.gt("inventory_qty", 0);
  if (params.stock === "out_of_stock") query = query.lte("inventory_qty", 0);

  if (params.refurbished === "yes") query = query.eq("refurbished_product", true);
  if (params.refurbished === "no") query = query.eq("refurbished_product", false);

  if (params.vat === "margin") query = query.eq("vat_margin", true);
  if (params.vat === "normal") query = query.eq("vat_margin", false);

  if (params.location === "gentbrugge") query = query.gt("stock_gentbrugge", 0);
  if (params.location === "oudenaarde") query = query.gt("stock_oudenaarde", 0);
  if (params.location === "antwerpen") query = query.gt("stock_antwerpen", 0);

  if (params.core === "yes") query = query.eq("core_assortment", true);
  if (params.core === "no") query = query.eq("core_assortment", false);

  if (params.minPrice) {
    query = query.gte("price_cents", Number(params.minPrice) * 100);
  }

  if (params.maxPrice) {
    query = query.lte("price_cents", Number(params.maxPrice) * 100);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[ERP ARTICLES] fetch error", error);
    return { articles: [], count: 0 };
  }

  return {
    articles: data as ErpArticle[],
    count: count || 0,
  };
}

function buildHref(
  base: Record<string, string>,
  overrides: Record<string, string>
) {
  const sp = new URLSearchParams();

  Object.entries({
    ...base,
    ...overrides,
  }).forEach(([key, value]) => {
    if (value) sp.set(key, value);
  });

  const qs = sp.toString();
  return qs ? `/admin/erp/articles?${qs}` : "/admin/erp/articles";
}

function ToggleButton({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium border ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-600 border-slate-200"
      }`}
    >
      {children}
    </span>
  );
}

export default async function ErpArticlesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = p(searchParams?.q).trim();
  const grade = p(searchParams?.grade).trim();
  const status = p(searchParams?.status).trim() || "active";
  const stock = p(searchParams?.stock).trim();
  const refurbished = p(searchParams?.refurbished).trim();
  const vat = p(searchParams?.vat).trim();
  const location = p(searchParams?.location).trim();
  const core = p(searchParams?.core).trim();
  const minPrice = p(searchParams?.minPrice).trim();
  const maxPrice = p(searchParams?.maxPrice).trim();

  const pageRaw = Number(p(searchParams?.page) || "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const baseParams = {
    q,
    grade,
    status,
    stock,
    refurbished,
    vat,
    location,
    core,
    minPrice,
    maxPrice,
  };

  const { articles, count } = await getArticles({
    q,
    grade,
    status,
    stock,
    refurbished,
    vat,
    location,
    core,
    minPrice,
    maxPrice,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const fromRecord = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            ERP Artikeldatabase
          </div>

          <h1 className="mt-3 text-3xl font-bold">
            Centrale ERP artikels
          </h1>

          <p className="mt-3 text-sm text-slate-300">
            Doorzoek, filter en beheer de gesynchroniseerde SKU database.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Artikelen
            </div>

            <div className="text-xs text-slate-500">
              {count} records · toont {fromRecord}-{toRecord} · pagina {page} van{" "}
              {totalPages}
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/admin/erp/sync" className="bb-btn text-sm">
              Sync
            </Link>

            <Link href="/admin/erp/import" className="bb-btn text-sm">
              Import
            </Link>
          </div>
        </div>

        <div className="border-b bg-white p-5">
          <form action="/admin/erp/articles" className="space-y-5">
            <input
              name="q"
              defaultValue={q}
              placeholder="Zoek SKU of titel..."
              className="w-full rounded-2xl border px-4 py-3 text-sm"
            />

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Status
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={buildHref(baseParams, { status: "active", page: "" })}>
                  <ToggleButton active={status === "active"}>
                    ✅ Actief
                  </ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { status: "inactive", page: "" })}>
                  <ToggleButton active={status === "inactive"}>
                    ⛔ Niet actief
                  </ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { status: "all", page: "" })}>
                  <ToggleButton active={status === "all"}>
                    📋 Alles
                  </ToggleButton>
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Grade uit omschrijving
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={buildHref(baseParams, { grade: "", page: "" })}>
                  <ToggleButton active={!grade}>Alle grades</ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { grade: "3", page: "" })}>
                  <ToggleButton active={grade === "3"}>3*</ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { grade: "4", page: "" })}>
                  <ToggleButton active={grade === "4"}>4*</ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { grade: "5", page: "" })}>
                  <ToggleButton active={grade === "5"}>5*</ToggleButton>
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                BTW
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={buildHref(baseParams, { vat: "", page: "" })}>
                  <ToggleButton active={!vat}>Alles</ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { vat: "margin", page: "" })}>
                  <ToggleButton active={vat === "margin"}>
                    Margin VAT
                  </ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { vat: "normal", page: "" })}>
                  <ToggleButton active={vat === "normal"}>
                    Normal VAT
                  </ToggleButton>
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Core assortiment
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={buildHref(baseParams, { core: "", page: "" })}>
                  <ToggleButton active={!core}>Alles</ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { core: "yes", page: "" })}>
                  <ToggleButton active={core === "yes"}>
                    Core assortiment
                  </ToggleButton>
                </Link>

                <Link href={buildHref(baseParams, { core: "no", page: "" })}>
                  <ToggleButton active={core === "no"}>
                    Geen core
                  </ToggleButton>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <select
                name="stock"
                defaultValue={stock}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                <option value="">📦 Alle voorraad</option>
                <option value="in_stock">Op voorraad</option>
                <option value="out_of_stock">Geen voorraad</option>
              </select>

              <select
                name="location"
                defaultValue={location}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                <option value="">📍 Alle locaties</option>
                <option value="gentbrugge">Gentbrugge</option>
                <option value="oudenaarde">Oudenaarde</option>
                <option value="antwerpen">Antwerpen</option>
              </select>

              <select
                name="refurbished"
                defaultValue={refurbished}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                <option value="">♻️ Refurb: alles</option>
                <option value="yes">Alleen refurb</option>
                <option value="no">Niet refurb</option>
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-600">
                Min prijs: €{minPrice || 0}
                <input
                  type="range"
                  name="minPrice"
                  min="0"
                  max="3000"
                  step="25"
                  defaultValue={minPrice || "0"}
                  className="mt-2 w-full"
                />
              </label>

              <label className="text-sm text-slate-600">
                Max prijs: €{maxPrice || 3000}
                <input
                  type="range"
                  name="maxPrice"
                  min="0"
                  max="3000"
                  step="25"
                  defaultValue={maxPrice || "3000"}
                  className="mt-2 w-full"
                />
              </label>
            </div>

            <div className="flex justify-between">
              <Link href="/admin/erp/articles" className="bb-btn text-sm">
                Reset
              </Link>

              <button type="submit" className="bb-btn bb-btn-primary text-sm">
                Filters toepassen
              </button>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Titel</th>
                <th className="px-4 py-3 text-left">Grade</th>
                <th className="px-4 py-3 text-left">Voorraad</th>
                <th className="px-4 py-3 text-left">Locaties</th>
                <th className="px-4 py-3 text-left">Core assortiment</th>
                <th className="px-4 py-3 text-left">Prijs</th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 align-top font-mono text-xs font-semibold">
                    {article.sku}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-900">
                      {article.title || "—"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {article.refurbished_product && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          Refurb
                        </span>
                      )}

                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          article.active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {article.active ? "Actief" : "Inactief"}
                      </span>

                      {article.published && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          Published
                        </span>
                      )}

                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          article.vat_margin
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {article.vat_margin ? "Margin VAT" : "Normal VAT"}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    {deriveGrade(article.title)}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        (article.inventory_qty || 0) > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {article.inventory_qty || 0}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top text-xs space-y-1">
                    <div>
                      Gentbrugge: <b>{article.stock_gentbrugge || 0}</b>
                    </div>
                    <div>
                      Oudenaarde: <b>{article.stock_oudenaarde || 0}</b>
                    </div>
                    <div>
                      Antwerpen: <b>{article.stock_antwerpen || 0}</b>
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    {article.refurbished_product ? (
                      <span className="text-xs text-slate-400">
                        Niet van toepassing
                      </span>
                    ) : (
                      <form action={toggleCoreAction}>
                        <input type="hidden" name="id" value={article.id} />
                        <input
                          type="hidden"
                          name="current"
                          value={String(!!article.core_assortment)}
                        />

                        <button
                          type="submit"
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            article.core_assortment
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}
                        >
                          {article.core_assortment ? "Core" : "Geen core"}
                        </button>
                      </form>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">
                      {money(article.price_cents)}
                    </div>

                    {article.compare_price_cents && (
                      <div className="text-xs text-slate-400 line-through">
                        {money(article.compare_price_cents)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {articles.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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

      <div className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
        <Link
          href={buildHref(baseParams, {
            page: String(Math.max(1, page - 1)),
          })}
          className={`bb-btn text-sm ${
            page <= 1 ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Vorige
        </Link>

        <div className="text-sm text-slate-500">
          Pagina {page} van {totalPages}
        </div>

        <Link
          href={buildHref(baseParams, {
            page: String(Math.min(totalPages, page + 1)),
          })}
          className={`bb-btn text-sm ${
            page >= totalPages ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Volgende
        </Link>
      </div>
    </div>
  );
}
