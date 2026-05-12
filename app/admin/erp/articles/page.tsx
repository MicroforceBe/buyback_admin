// app/admin/erp/articles/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpArticle = {
  id: string;
  sku: string;
  ean: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  capacity_gb: number | null;
  color: string | null;
  category: string | null;
  condition_grade: string | null;
  active: boolean | null;
  updated_at: string | null;
};

async function getArticles(q: string): Promise<ErpArticle[]> {
  let query = supabaseAdmin
    .from("erp_articles")
    .select(
      "id, sku, ean, title, brand, model, capacity_gb, color, category, condition_grade, active, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(
      `sku.ilike.%${q}%,ean.ilike.%${q}%,title.ilike.%${q}%,model.ilike.%${q}%,brand.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ERP ARTICLES] fetch error", error);
    return [];
  }

  return data as ErpArticle[];
}

function formatDate(date: string | null) {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleDateString("nl-BE");
  } catch {
    return date;
  }
}

export default async function ErpArticlesPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = String(searchParams?.q || "").trim();
  const articles = await getArticles(q);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP
          </div>

          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Artikel database
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Centrale SKU master voor refurb, buyback leads en labelprinting.
          </p>
        </div>

        <Link href="/admin/erp" className="bb-btn text-sm">
          Terug naar ERP
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <form action="/admin/erp/articles" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op SKU, EAN, titel, merk of model..."
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <button type="submit" className="bb-btn bb-btn-primary text-sm">
            Zoeken
          </button>

          {q && (
            <Link href="/admin/erp/articles" className="bb-btn text-sm">
              Reset
            </Link>
          )}
        </form>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
          <div className="text-sm font-medium text-slate-900">
            Artikelen
          </div>

          <div className="text-xs text-slate-500">
            {articles.length} resultaat{articles.length === 1 ? "" : "en"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b px-3 py-2 text-left">SKU</th>
                <th className="border-b px-3 py-2 text-left">EAN</th>
                <th className="border-b px-3 py-2 text-left">Titel</th>
                <th className="border-b px-3 py-2 text-left">Merk</th>
                <th className="border-b px-3 py-2 text-left">Model</th>
                <th className="border-b px-3 py-2 text-left">Cap.</th>
                <th className="border-b px-3 py-2 text-left">Kleur</th>
                <th className="border-b px-3 py-2 text-left">Grade</th>
                <th className="border-b px-3 py-2 text-left">Status</th>
                <th className="border-b px-3 py-2 text-left">Update</th>
              </tr>
            </thead>

            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="hover:bg-slate-50">
                  <td className="border-b px-3 py-2 font-medium">
                    {article.sku}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.ean || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.title || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.brand || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.model || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.capacity_gb ? `${article.capacity_gb}GB` : "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.color || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    {article.condition_grade || "—"}
                  </td>

                  <td className="border-b px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        article.active
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {article.active ? "Actief" : "Inactief"}
                    </span>
                  </td>

                  <td className="border-b px-3 py-2 text-slate-500">
                    {formatDate(article.updated_at)}
                  </td>
                </tr>
              ))}

              {articles.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
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
