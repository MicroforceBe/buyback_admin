
// app/admin/catalog/page.tsx

import { listCategories, listModelsByCategory } from "./actions";
import Table from "./table";

type Props = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CatalogPage({ searchParams }: Props) {
  const selected =
    (typeof searchParams?.category === "string" && searchParams?.category) || "__ALL__";

  const [categories, rows] = await Promise.all([
    listCategories(),
    listModelsByCategory(selected === "__ALL__" ? null : selected),
  ]);

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Catalogus</h1>

        {/* (optioneel) placeholder-knop voor categorie toevoegen; disabled tot eigen route aanwezig is */}
        <button
          formAction="/api/admin/catalog/new-category" // <-- React gebruikt 'formAction' (camelCase)
          className="bb-btn"
          disabled
          title="Gebruik 'Model toevoegen' hieronder om meteen met nieuwe categorie te starten."
        >
          Categorie toevoegen
        </button>
      </header>

      {/* Categorie-tegels */}
      <section className="space-y-3">
        <div className="text-sm text-gray-500">Categorieën</div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "__ALL__", label: "Alle" },
            ...categories.map((c) => ({ key: c, label: c })),
          ].map((c) => {
            const isActive = c.key === selected;
            const url = new URL("/admin/catalog", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
            url.searchParams.set("category", c.key);
            return (
              <a
                key={c.key}
                href={url.pathname + "?" + url.searchParams.toString()}
                className={`bb-tile px-3 py-2 ${
                  isActive ? "ring-2 ring-emerald-500" : ""
                }`}
              >
                {c.label}
              </a>
            );
          })}
        </div>
      </section>

      {/* Tabel met modellen (excel-achtig) */}
      <section>
        <Table
          category={selected === "__ALL__" ? null : selected}
          rows={rows}
          allCategories={categories}
        />
      </section>
    </div>
  );
}
