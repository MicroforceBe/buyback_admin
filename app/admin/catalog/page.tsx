// app/admin/catalog/page.tsx
// Server Component

import { getCategories, getCatalogRows } from "./actions";
import Table from "./table";

type PageProps = {
  searchParams?: {
    category?: string;
    q?: string;
  };
};

function hrefWith(params: Record<string, string | undefined>) {
  const url = new URL("/admin/catalog", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
  Object.entries(params).forEach(([k, v]) => {
    if (v && v.length) url.searchParams.set(k, v);
  });
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const selected = (searchParams?.category ?? "__ALL__").trim();
  const q = (searchParams?.q ?? "").trim().toLowerCase();

  // 1) Categorieën ophalen
  const categories = await getCategories(); // string[]

  // 2) Rijen ophalen (optioneel per categorie) + server-side free text filter
  const rowsRaw = await getCatalogRows(selected === "__ALL__" ? null : selected);
  const rows = !q
    ? rowsRaw
    : rowsRaw.filter((r) => {
        const hay =
          `${r.brand ?? ""} ${r.model ?? ""} ${r.submodel ?? ""} ${r.variant ?? ""}`.toLowerCase();
        return hay.includes(q);
      });

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
      </header>

      {/* Categorie-tegels */}
      <section className="space-y-2">
        <div className="text-sm text-gray-500">Categorieën</div>
        <div className="flex flex-wrap gap-2">
          {/* 'Alle' tegel */}
          <a
            href={hrefWith({ category: "__ALL__", q: q || undefined })}
            className={`bb-tile px-3 py-2 ${selected === "__ALL__" ? "ring-2 ring-emerald-500" : ""}`}
            aria-current={selected === "__ALL__" ? "page" : undefined}
          >
            Alle
          </a>

          {categories.map((cat) => {
            const isActive = selected === cat;
            return (
              <a
                key={cat}
                href={hrefWith({ category: cat, q: q || undefined })}
                className={`bb-tile px-3 py-2 ${isActive ? "ring-2 ring-emerald-500" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={cat}
              >
                {cat}
              </a>
            );
          })}
        </div>
      </section>

      {/* Zoeken (server-side) */}
      <section>
        <form method="get" action="/admin/catalog" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="category" value={selected} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op model, merk of variant…"
            className="w-full md:w-80 border rounded px-3 py-2"
          />
          <button type="submit" className="bb-btn">Zoek</button>
          {q && (
            <a
              href={hrefWith({ category: selected })}
              className="text-sm text-gray-500 underline"
            >
              wissen
            </a>
          )}
        </form>
      </section>

      {/* Tabel */}
      <section>
        <Table rows={rows} allCategories={categories} />
      </section>
    </div>
  );
}
