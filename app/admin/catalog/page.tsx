// app/admin/catalog/page.tsx
import Link from "next/link";
import {
  loadCategories,
  loadModelsByCategory,
  createCategoryAction,
  type Category,
} from "./actions";
import CatalogTable from "./table";

type SearchParams = { category?: string; q?: string };

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { category: selectedId = "", q = "" } = searchParams ?? {};
  const categories = await loadCategories();
  const selected = selectedId || (categories[0]?.id ?? "");
  const models = selected ? await loadModelsByCategory(selected) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        <Link href="/admin/leads" className="px-3 py-2 rounded border bg-white hover:bg-gray-50">
          ← Terug naar leads
        </Link>
      </div>

      {/* Categorie tegels + toevoegen */}
      <section className="rounded border bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Categorieën</h2>
          <form action={createCategoryAction} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="Nieuwe categorie…"
              className="border rounded px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
              required
            />
            <button type="submit" className="px-3 py-2 rounded border bg-white hover:bg-gray-50">
              Toevoegen
            </button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c: Category) => {
            const isActive = c.id === selected;
            const href =
              "/admin/catalog?" +
              new URLSearchParams({ ...(c.id ? { category: c.id } : {}), ...(q ? { q } : {}) }).toString();
            return (
              <Link
                key={c.id}
                href={href}
                className={
                  "px-3 py-2 rounded border " +
                  (isActive ? "bg-green-600 text-white border-green-700" : "bg-white hover:bg-gray-50")
                }
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Zoek op model (GET) */}
      <section className="flex items-center justify-between gap-3">
        <form method="get" className="w-full max-w-md flex items-center gap-2">
          {selected && <input type="hidden" name="category" value={selected} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op model…"
            className="w-full border rounded px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
          />
          <button type="submit" className="px-3 py-2 rounded border bg-white hover:bg-gray-50">
            Zoek
          </button>
        </form>
      </section>

      {/* Tabel */}
      <section>
        {selected ? (
          <CatalogTable rows={models} categoryId={selected} query={q} />
        ) : (
          <div className="text-sm text-gray-600">Geen categorie geselecteerd.</div>
        )}
      </section>
    </div>
  );
}
