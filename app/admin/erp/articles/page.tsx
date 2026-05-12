// app/admin/erp/articles/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpArticle = {
  id: string;
  sku: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  condition_grade: string | null;
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
};

const PAGE_SIZE = 100;

function money(cents: number | null) {
  if (typeof cents !== "number") return "—";

  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

async function getFilterOptions() {
  const { data, error } = await supabaseAdmin
    .from("erp_articles")
    .select("brand, model, condition_grade")
    .eq("active", true);

  if (error) {
    console.error("[ERP ARTICLES] filter options error", error);
    return { brands: [], models: [], grades: [] };
  }

  return {
    brands: Array.from(
      new Set((data || []).map((x: any) => x.brand).filter(Boolean))
    ).sort(),
    models: Array.from(
      new Set((data || []).map((x: any) => x.model).filter(Boolean))
    ).sort(),
    grades: Array.from(
      new Set((data || []).map((x: any) => x.condition_grade).filter(Boolean))
    ).sort(),
  };
}

async function getArticles(params: {
  q: string;
  brand: string;
  model: string;
  grade: string;
  status: string;
  stock: string;
  refurbished: string;
  vat: string;
  location: string;
  page: number;
}) {
  const from = (params.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabaseAdmin
    .from("erp_articles")
    .select(
      `
      id,
      sku,
      title,
      brand,
      model,
      condition_grade,
      active,
      published,
      refurbished_product,
      vat_margin,
      inventory_qty,
      stock_gentbrugge,
      stock_oudenaarde,
      stock_antwerpen,
      price_cents,
      compare_price_cents
    `,
      { count: "exact" }
    )
    .order("sku", { ascending: false })
    .range(from, to);

  if (params.q) {
    query = query.or(
      `sku.ilike.%${params.q}%,title.ilike.%${params.q}%,brand.ilike.%${params.q}%,model.ilike.%${params.q}%,condition_grade.ilike.%${params.q}%`
    );
  }

  if (params.status === "inactive") {
    query = query.eq("active", false);
  } else if (params.status !== "all") {
    query = query.eq("active", true);
  }

  if (params.brand) query = query.eq("brand", params.brand);
  if (params.model) query = query.eq("model", params.model);
  if (params.grade) query = query.eq("condition_grade", params.grade);

  if (params.stock === "in_stock") query = query.gt("inventory_qty", 0);
  if (params.stock === "out_of_stock") query = query.lte("inventory_qty", 0);

  if (params.refurbished === "yes") query = query.eq("refurbished_product", true);
  if (params.refurbished === "no") query = query.eq("refurbished_product", false);

  if (params.vat === "margin") query = query.eq("vat_margin", true);
  if (params.vat === "normal") query = query.eq("vat_margin", false);

  if (params.location === "gentbrugge") query = query.gt("stock_gentbrugge", 0);
  if (params.location === "oudenaarde") query = query.gt("stock_oudenaarde", 0);
  if (params.location === "antwerpen") query = query.gt("stock_antwerpen", 0);

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

function buildHref(baseParams: Record<string, string>, overrides: Record<string, string>) {
  const sp = new URLSearchParams();

  Object.entries({ ...baseParams, ...overrides }).forEach(([key, value]) => {
    if (value) sp.set(key, value);
  });

  const qs = sp.toString();
  return qs ? `/admin/erp/articles?${qs}` : "/admin/erp/articles";
}

export default async function ErpArticlesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = getStringParam(searchParams?.q).trim();
  const brand = getStringParam(searchParams?.brand).trim();
  const model = getStringParam(searchParams?.model).trim();
  const grade = getStringParam(searchParams?.grade).trim();
  const status = getStringParam(searchParams?.status).trim() || "active";
  const stock = getStringParam(searchParams?.stock).trim();
  const refurbished = getStringParam(searchParams?.refurbished).trim();
  const vat = getStringParam(searchParams?.vat).trim();
  const location = getStringParam(searchParams?.location).trim();

  const pageRaw = Number(getStringParam(searchParams?.page) || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const baseParams = {
    q,
    brand,
    model,
    grade,
    status,
    stock,
    refurbished,
    vat,
    location,
  };

  const [{ articles, count }, filterOptions] = await Promise.all([
    getArticles({
      q,
      brand,
      model,
      grade,
      status,
      stock,
      refurbished,
      vat,
      location,
      page,
    }),
    getFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            ERP Artikeldatabase
          </div>

          <h1 className="mt-3 text-3xl font-bold">Centrale ERP artikels</h1>

          <p className="mt-3 text-sm text-slate-300">
            Doorzoek, filter en beheer de gesynchroniseerde SKU database voor
            refurb, leads en labelprinting.
          </p>
        </div>
      </div>

      <form
        action="/admin/erp/articles"
        className="rounded-2xl border bg-white p-5 shadow-sm space-y-5"
      >
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              🔎 Filters
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Verfijn op SKU, artikelstatus, voorraad, BTW-regeling, locatie,
              merk, model en grade.
            </p>
          </div>

          <div className="text-sm text-slate-500">
            {count} artikel{count === 1 ? "" : "en"}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <label className="space-y-1 xl:col-span-2">
            <span className="text-xs font-medium text-slate-500">
              🔍 Zoekterm
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="SKU, titel, merk, model of grade..."
              className="w-full rounded-xl border px-4 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              ✅ Artikelstatus
            </span>
            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="active">Alleen actief</option>
              <option value="all">Alle artikels</option>
              <option value="inactive">Alleen niet actief</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              📦 Voorraad
            </span>
            <select
              name="stock"
              defaultValue={stock}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle voorraad</option>
              <option value="in_stock">Op voorraad</option>
              <option value="out_of_stock">Geen voorraad</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              🧾 BTW-regeling
            </span>
            <select
              name="vat"
              defaultValue={vat}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle BTW-regelingen</option>
              <option value="margin">Margin VAT</option>
              <option value="normal">Normal VAT</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              📍 Locatie
            </span>
            <select
              name="location"
              defaultValue={location}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle locaties</option>
              <option value="gentbrugge">Microforce Gentbrugge</option>
              <option value="oudenaarde">Microforce Oudenaarde</option>
              <option value="antwerpen">Microforce Antwerpen</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              ♻️ Refurb
            </span>
            <select
              name="refurbished"
              defaultValue={refurbished}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Refurb: alles</option>
              <option value="yes">Alleen refurb</option>
              <option value="no">Niet refurb</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              🏷️ Merk
            </span>
            <select
              name="brand"
              defaultValue={brand}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle merken</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              📱 Model
            </span>
            <select
              name="model"
              defaultValue={model}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle modellen</option>
              {filterOptions.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              ⭐ Grade
            </span>
            <select
              name="grade"
              defaultValue={grade}
              className="w-full rounded-xl border px-4 py-2 text-sm"
            >
              <option value="">Alle grades</option>
              {filterOptions.grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-between gap-2 border-t pt-4">
          <div className="text-sm text-slate-500">
            Pagina {page} van {totalPages} · meest recente SKU’s bovenaan
          </div>

          <div className="flex gap-2">
            <Link href="/admin/erp/articles" className="bb-btn text-sm">
              Reset
            </Link>

            <button type="submit" className="bb-btn bb-btn-primary text-sm">
              Filteren
            </button>
          </div>
        </div>
      </form>

      <div className="flex justify-end gap-2">
        <Link href="/admin/erp/sync" className="bb-btn text-sm">
          Sync
        </Link>

        <Link href="/admin/erp/import" className="bb-btn text-sm">
          Import
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Titel</th>
                <th className="px-4 py-3 text-left">Grade</th>
                <th className="px-4 py-3 text-left">Voorraad</th>
                <th className="px-4 py-3 text-left">Locaties</th>
                <th className="px-4 py-3 text-left">Prijs</th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs font-semibold text-slate-900">
                      {article.sku}
                    </div>
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

                      {article.active ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          Actief
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Inactief
                        </span>
                      )}

                      {article.published && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          Published
                        </span>
                      )}

                      {article.vat_margin ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Margin VAT
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Normal VAT
                        </span>
                      )}
                    </div>

                    {(article.brand || article.model) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {[article.brand, article.model].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    {article.condition_grade || "—"}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        (article.inventory_qty || 0) > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {article.inventory_qty || 0}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1 text-xs">
                      <div>
                        Gentbrugge: <b>{article.stock_gentbrugge || 0}</b>
                      </div>
                      <div>
                        Oudenaarde: <b>{article.stock_oudenaarde || 0}</b>
                      </div>
                      <div>
                        Antwerpen: <b>{article.stock_antwerpen || 0}</b>
                      </div>
                    </div>
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
                    colSpan={6}
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
