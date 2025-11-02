// app/admin/catalog/page.tsx
import Link from 'next/link';
import { loadCategories, loadModelsByCategory, createCategoryAction, type Category } from './actions';
import CatalogTable from './table';

type SearchParams = { category?: string; q?: string };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { category: selectedId = '', q = '' } = searchParams ?? {};
  const categories = await loadCategories();

  // Kies default categorie (eerste) indien niet opgegeven
  const selected = selectedId || (categories[0]?.id ?? '');
  const models = selected ? await loadModelsByCategory(selected) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        <Link href="/admin/leads" className="bb-btn">← Terug naar leads</Link>
      </div>

      {/* Categorieën + toevoegen */}
      <section className="bb-card p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Categorieën</h2>
          <form action={createCategoryAction} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="Nieuwe categorie…"
              className="bb-input"
              required
            />
            <button type="submit" className="bb-btn border">Toevoegen</button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c: Category) => {
            const isActive = c.id === selected;
            const url = new URL('/admin/catalog', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost');
            url.searchParams.set('category', c.id);
            if (q) url.searchParams.set('q', q);
            return (
              <Link
                key={c.id}
                href={url.pathname + url.search}
                className={`px-3 py-2 rounded border ${isActive ? 'bg-green-600 text-white border-green-700' : 'bg-white hover:bg-gray-50'}`}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Zoeken op model */}
      <section className="flex items-center justify-between gap-3">
        <form className="w-full max-w-md">
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op model…"
            className="w-full bb-input"
            onChange={(e) => {
              const url = new URL('/admin/catalog', window.location.origin);
              if (selected) url.searchParams.set('category', selected);
              const val = e.currentTarget.value.trim();
              if (val) url.searchParams.set('q', val); else url.searchParams.delete('q');
              window.location.assign(url.toString());
            }}
          />
        </form>
      </section>

      {/* Tabel met bewerkbare rijen */}
      <section>
        {selected ? (
          <CatalogTable rows={models} query={q} />
        ) : (
          <div className="text-sm text-gray-600">Geen categorie geselecteerd.</div>
        )}
      </section>

      <style jsx global>{`
        .bb-input {
          @apply border rounded px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600;
        }
        .bb-btn {
          @apply px-3 py-2 rounded border bg-white hover:bg-gray-50;
        }
        .bb-card {
          @apply rounded border bg-white;
        }
      `}</style>
    </div>
  );
}
