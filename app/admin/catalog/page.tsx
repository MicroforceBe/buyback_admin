// app/admin/catalog/page.tsx

import Link from "next/link";
import { getCategories, getCatalogRows, getCategoryImage } from "./actions";
import Table from "./table";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";

type Props = {
  searchParams?: {
    category?: string;
    q?: string;
  };
};

export const revalidate = 0; // altijd vers (admin)

export default async function CatalogPage({ searchParams }: Props) {
  // 🔐 Auth + rechten
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  if (!hasPermission(adminUser, "catalog", "read")) {
    return (
      <div className="p-4 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Catalogus</h1>
          <Link href="/admin" className="bb-btn">
            ← Terug naar admin
          </Link>
        </header>

        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">
            Je hebt geen rechten om deze pagina te bekijken.
          </div>
          <p className="text-xs text-red-600 mt-1">
            Vraag een beheerder om je &quot;catalog&quot;-rechten aan te passen onder
            Settings &gt; Users.
          </p>
        </div>
      </div>
    );
  }

  // Query params
  const selected = searchParams?.category ?? "__ALL__";
  const q = (searchParams?.q ?? "").trim();

  const selectedCategory = selected === "__ALL__" ? null : selected;

  // 1) Categorieën voor de tegels
  const categories = await getCategories();

  // 2) Rijen ophalen met correcte argumentvorm
  const rows = await getCatalogRows({
    category: selectedCategory,
    q: q || null,
  });

  // 3) Categorie-afbeelding voor de huidige categorie (indien niet "Alle")
  const categoryImageUrl =
    selectedCategory ? await getCategoryImage(selectedCategory) : null;

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
        {/* (optioneel) naar overzicht of andere admin secties */}
        <Link href="/admin" className="bb-btn">
          ← Terug naar admin
        </Link>
      </header>

      {/* Categorie tegels + "Alle" + "Nieuwe categorie" */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Categorieën</h2>

          {/* Snelle zoekbalk (server side via ?q=) */}
          <form
            className="flex items-center gap-2"
            action="/admin/catalog"
            method="get"
          >
            {/* behoud category in de query wanneer we zoeken */}
            <input type="hidden" name="category" value={selected} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Zoek op merk/model…"
              className="border rounded px-3 py-2 text-sm"
            />
            <button className="bb-btn" type="submit">
              Zoek
            </button>
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
            const href = `/admin/catalog?category=${encodeURIComponent(
              c,
            )}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <CategoryTile
                key={c}
                label={c}
                isActive={isActive}
                href={href}
              />
            );
          })}

          {/* hint-knop (blijft disabled, is enkel uitleg) */}
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
          category={selectedCategory}
          rows={rows}
          allCategories={categories}
          categoryImageUrl={categoryImageUrl}
        />
      </section>
    </div>
  );
}

function CategoryTile(props: {
  label: string;
  isActive: boolean;
  href: string;
}) {
  const { label, isActive, href } = props;
  return (
    <Link
      href={href}
      className={`bb-tile px-3 py-2 ${
        isActive ? "ring-2 ring-emerald-600" : ""
      }`}
    >
      {label}
    </Link>
  );
}
