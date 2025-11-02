// Server Component
import { listCategories, listModelsByCategory } from "./actions";
import CatalogTable from "./table";

type SearchParams = { category?: string | null; q?: string | null };

export default async function CatalogPage(props: { searchParams?: SearchParams }) {
  const searchParams = props.searchParams || {};
  const selectedCategory = (searchParams.category ?? "__ALL__") || "__ALL__";
  const q = (searchParams.q ?? "").trim();

  const [categories, rows] = await Promise.all([
    listCategories(),
    listModelsByCategory(selectedCategory),
  ]);

  // filter client-side op model (tekst)
  const filtered = q
    ? rows.filter(r =>
        (r.model || "").toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="p-4 space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Catalogus</h1>

        {/* Tegels + 'Categorie toevoegen' */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`/admin/catalog?category=__ALL__`}
            className={`bb-tile px-4 py-2 ${selectedCategory==="__ALL__" ? "ring-2 ring-blue-500" : ""}`}
          >
            Alle categorieën
          </a>
          {categories.map((cat) => (
            <a
              key={cat}
              href={`/admin/catalog?category=${encodeURIComponent(cat)}`}
              className={`bb-tile px-4 py-2 ${selectedCategory===cat ? "ring-2 ring-blue-500" : ""}`}
            >
              {cat}
            </a>
          ))}
          <form
            action="/admin/catalog"
            className="bb-tile px-3 py-2 flex items-center gap-2"
            onSubmit={(e) => {
              // no-op; Server Nav via GET met query param
            }}
          >
            <input
              name="__newcat"
              placeholder="Nieuwe categorie…"
              className="border rounded px-2 py-1"
            />
            <button
              formaction="/api/admin/catalog/new-category" // (optioneel) eigen route, of laat het in de Table gebeuren
              className="bb-btn"
              disabled
              title="Gebruik 'Model toevoegen' hieronder om meteen met nieuwe categorie te starten."
            >
              + Voeg toe
            </button>
          </form>
        </div>

        {/* Zoekbalk op model */}
        <form className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Zoek op model…"
            className="w-full max-w-sm border rounded px-3 py-2"
          />
          <input type="hidden" name="category" value={selectedCategory} />
          <button className="bb-btn">Filter</button>
          <a href={`/admin/catalog?category=${encodeURIComponent(selectedCategory)}`} className="text-sm underline">
            Reset
          </a>
        </form>
      </header>

      <section>
        <CatalogTable
          rows={filtered}
          selectedCategory={selectedCategory === "__ALL__" ? null : selectedCategory}
        />
      </section>
    </div>
  );
}
