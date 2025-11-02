
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// === Types ===
type Category = {
  id: string;
  name: string;
  position: number | null;
};

// (eventueel) type voor props of fetch-result
type CategoriesResponse = Category[];

// === Component ===
export default function CatalogPage() {
  const [categories, setCategories] = useState<CategoriesResponse>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    // TODO: vervang door jouw echte fetch (Supabase of API)
    // Voorbeeld:
    // fetch('/api/catalog/categories')
    //   .then(r => r.json())
    //   .then((rows: CategoriesResponse) => setCategories(rows));
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(query));
  }, [categories, q]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        <Link href="/admin/catalog/new" className="bb-btn border is-active">Categorie toevoegen</Link>
      </header>

      <div className="flex items-center gap-3">
        <input
          className="border rounded px-3 py-2 w-80"
          placeholder="Zoek categorie…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Categorie-tegels */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c: Category) => {
          const isActive = c.id === selected;

          // Let op: fallback BASE_URL moet een string zijn
          const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const url = new URL('/admin/catalog', base);
          url.searchParams.set('category', c.id);

          return (
            <Link
              key={c.id}
              href={url.toString()}
              onClick={() => setSelected(c.id)}
              className={`bb-tile px-4 py-3 ${isActive ? 'ring-2 ring-emerald-500' : ''}`}
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-gray-500">#{c.position ?? 0}</div>
            </Link>
          );
        })}
      </div>

      {/* Hier komt je tabel met modellen (afhankelijk van selected) */}
      {/* <ModelsTable categoryId={selected} /> */}
    </div>
  );
}
