import Link from "next/link";
import { listCategories, listModelsByCategory, createCategory } from "./actions";
import CatalogTable from "./table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Tile({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        active ? "border-emerald-500 ring-1 ring-emerald-400" : "border-gray-200"
      }`}
      style={{ background: active ? "rgba(16,185,129,0.05)" : "white" }}
    >
      {children}
    </div>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { cat?: string };
}) {
  const categories = await listCategories();
  const activeCat = searchParams?.cat || (categories[0]?.id ?? null);
  const models = activeCat ? await listModelsByCategory(activeCat) : [];

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        <Link href="/admin/leads" className="text-sm underline">
          ← Terug naar leads
        </Link>
      </div>

      {/* Categorie tegels + nieuwe categorie */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Categorieën</h2>
          <form action={createCategory} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="Nieuwe categorie…"
              className="border rounded px-3 py-1.5 text-sm"
              required
            />
            <button className="px-3 py-1.5 rounded text-sm border hover:bg-gray-50">
              Toevoegen
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
          {categories.map((c) => {
            const href = `/admin/catalog?cat=${encodeURIComponent(c.id)}`;
            const active = c.id === activeCat;
            return (
              <Link key={c.id} href={href} className="no-underline">
                <Tile active={active}>
                  <div className="font-medium">{c.name}</div>
                </Tile>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tabel voor gekozen categorie */}
      {activeCat ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Modellen</h2>
          </div>
          <CatalogTable categoryId={activeCat} initialModels={models} />
        </section>
      ) : (
        <div className="text-sm text-gray-600">Kies of maak eerst een categorie.</div>
      )}
    </div>
  );
}
