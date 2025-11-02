import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";
import CatalogTable from "./table";
import { createCategoryAction } from "./actions";

function sb() {
  const any = supabaseAdminExport as any;
  return typeof any === "function" ? any() : any;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const s = sb();

  // data ophalen
  const { data: categories = [] } = await s
    .from("buyback_categories")
    .select("id, name, position")
    .order("position", { ascending: true });

  const selected = (typeof searchParams?.category === "string" && searchParams?.category) || categories[0]?.id || null;
  const q = (typeof searchParams?.q === "string" && searchParams?.q) || "";

  // modellen + capaciteiten van de geselecteerde categorie
  let query = s
    .from("buyback_models")
    .select("id, brand, model, image_url, active, category_id, buyback_capacities(id, model_id, variant, capacity_gb, price_cents, active)")
    .eq("category_id", selected ?? "");

  if (q) {
    query = query.ilike("model", `%${q}%`);
  }

  const { data: models = [] } = await query.order("brand", { ascending: true }).order("model", { ascending: true });

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogus</h1>
      </header>

      {/* Categorie tegels + toevoegen */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Categorieën</h2>
          <form action={createCategoryAction} className="flex items-center gap-2">
            <input
              name="name"
              required
              placeholder="Nieuwe categorie"
              className="border rounded px-3 py-1.5 text-sm"
            />
            <button className="px-3 py-1.5 text-sm rounded bg-black text-white hover:opacity-90">
              Toevoegen
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const isActive = c.id === selected;
            const url = new URL("/admin/catalog", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost");
            url.searchParams.set("category", c.id);
            if (q) url.searchParams.set("q", q);
            const href = `/admin/catalog?category=${encodeURIComponent(c.id)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <a
                key={c.id}
                href={href}
                className={`px-3 py-2 rounded border text-sm ${isActive ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}
              >
                {c.name}
              </a>
            );
          })}
        </div>
      </section>

      {/* Tabel + search */}
      <CatalogTable
        categoryId={selected}
        models={models as any[]}
        search={q}
      />
    </div>
  );
}
