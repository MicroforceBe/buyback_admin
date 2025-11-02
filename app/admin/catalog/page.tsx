// app/admin/catalog/page.tsx

import Link from "next/link";
import { getCategories, getCatalogRows } from "./actions";
import Table from "./table";

type Props = {
  searchParams?: {
    category?: string;
    q?: string;
  };
};

export const revalidate = 0; // altijd vers (admin)

export default async function CatalogPage({ searchParams }: Props) {
  // Query params
  const selected = searchParams?.category ?? "__ALL__";
  const q = (searchParams?.q ?? "").trim();

  // 1) Categorieën voor de tegels
  const categories = await getCategories();

  // 2) Rijen ophalen met correcte argumentvorm
  const rows = await getCatalogRows({
    category: selected === "__ALL__" ? null : selected,
    q: q || null,
  });

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        {/* (optioneel) naar overzicht of andere admin secties */}
        <Link href="/admin" className="bb-btn">← Terug naar admin</Link>
      </header>

      {/* Categorie tegels + "Alle" + "Nieuwe categorie" */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Categorieën</h2>

          {/* Snelle zoekbalk (server side via ?q=) */}
          <form className="flex items-center gap-2" action="/admin/catalog" method="get">
            {/* behoud category in de query wanneer we zoeken */}
            <input type="hidden" name="category" value={selected} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Zoek op merk/model…"
              className="border rounded px-3 py-2 text-sm"
            />
            <button className="bb-btn" type="submit">Zoek</button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* "Alle" tegel */}
          <CategoryTile
            label="Alle"
            isActive={selected === "__ALL__"}
            href={`/admin/catalog?category=__ALL__${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          />
          {/* bestaande categorieën */}
          {categories.map((c) => {
            const isActive = selected === c;
            const url = new URL("/admin/catalog", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
            url.searchParams.set("category", c);
            if (q) url.searchParams.set("q", q);
            return (
              <CategoryTile
                key={c}
                label={c}
                isActive={isActive}
                href={url.pathname + "?" + url.searchParams.toString()}
              />
            );
          })}

          {/* (optioneel) knop om via de tabel meteen een nieuw model met nieuwe categorie te maken */}
          <button
            className="bb-btn opacity-60 cursor-not-allowed"
            title="Gebruik 'Model toevoegen' onderaan de tabel om meteen een nieuwe categorie aan te maken."
            disabled
          >
            + Nieuwe categorie
          </button>
        </div>
      </section>

      {/* Tabel */}
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

function CategoryTile(props: { label: string; isActive: boolean; href: string }) {
  const { label, isActive, href } = props;
  return (
    <Link
      href={href}
      className={`bb-tile px-3 py-2 ${isActive ? "ring-2 ring-emerald-600" : ""}`}
    >
      {label}
    </Link>
  );
}
