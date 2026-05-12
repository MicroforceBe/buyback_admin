// app/admin/refurb/RefurbTools.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SearchResult = {
  source: "Receptie lijst" | "Lead";
  reference_number: string | null;
  sku: string | null;
  description: string | null;
  used_parts: string | null;
  battery_status: string | null;
  purchase_date: string | null;
  supplier: string | null;
  link?: string;
};

async function searchRefurbDevice(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  const { data: receptionItems, error: receptionErr } = await supabaseAdmin
    .from("refurb_reception_items")
    .select(`
      id,
      reception_id,
      sku,
      description,
      used_parts,
      imei_sn,
      manual_sn,
      created_at,
      location,
      refurb_status,
      refurb_receptions (
        id,
        reception_number,
        reception_date,
        supplier
      )
    `)
    .or(`imei_sn.ilike.%${q}%,manual_sn.ilike.%${q}%`)
    .limit(50);

  if (receptionErr) {
    console.error("[REFURB TOOLS] search reception items error", receptionErr);
  }

  for (const item of receptionItems || []) {
    const reception = Array.isArray((item as any).refurb_receptions)
      ? (item as any).refurb_receptions[0]
      : (item as any).refurb_receptions;

    results.push({
      source: "Receptie lijst",
      reference_number: reception?.reception_number || null,
      sku: (item as any).sku || null,
      description: (item as any).description || null,
      used_parts: (item as any).used_parts || null,
      battery_status: null,
      purchase_date:
        reception?.reception_date || (item as any).created_at || null,
      supplier: reception?.supplier || null,
      link: reception?.id ? `/admin/refurb/${reception.id}` : undefined,
    });
  }

  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from("buyback_leads")
    .select(`
      id,
      created_at,
      source,
      model,
      capacity_gb,
      sku,
      imei_sn,
      battery_percentage,
      used_parts_skus,
      order_code,
      customer_number,
      status
    `)
    .ilike("imei_sn", `%${q}%`)
    .limit(50);

  if (leadsErr) {
    console.error("[REFURB TOOLS] search buyback leads error", leadsErr);
  }

  for (const lead of leads || []) {
    results.push({
      source: "Lead",
      reference_number: (lead as any).order_code || null,
      sku: (lead as any).sku || null,
      description:
        [
          (lead as any).model,
          (lead as any).capacity_gb
            ? `${(lead as any).capacity_gb}GB`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      used_parts: Array.isArray((lead as any).used_parts_skus)
        ? (lead as any).used_parts_skus.join(", ")
        : null,
      battery_status:
        (lead as any).battery_percentage != null
          ? `${(lead as any).battery_percentage}%`
          : null,
      purchase_date: (lead as any).created_at || null,
      supplier: (lead as any).source || null,
      link: (lead as any).id ? `/admin/leads/${(lead as any).id}` : undefined,
    });
  }

  return results;
}

export default async function RefurbTools({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = String(searchParams?.q || "").trim();
  const searchResults = await searchRefurbDevice(q);

  return (
    <details className="rounded-md border bg-white" open={!!q}>
      <summary className="cursor-pointer select-none px-4 py-3 font-medium">
        Refurb tools
      </summary>

      <div className="border-t p-4 space-y-4">
        <div className="flex gap-2 border-b">
          <div className="border-b-2 border-blue-600 px-3 py-2 text-sm font-medium">
            Search
          </div>
        </div>

        <form className="flex gap-2" action="/admin/refurb">
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op IMEI / SN"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <button type="submit" className="bb-btn bb-btn-primary text-sm">
            Zoek
          </button>
        </form>

        {q && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              Resultaten voor: <span className="font-medium">{q}</span>
            </div>

            {searchResults.length === 0 && (
              <div className="rounded-md border p-4 text-sm text-slate-500">
                Geen resultaat gevonden.
              </div>
            )}

            {searchResults.map((result, index) => (
              <div
                key={`${result.source}-${index}`}
                className="rounded-md border p-4 text-sm space-y-1"
              >
                <div>
                  <b>Bron:</b>{" "}
                  {result.source === "Lead"
                    ? `Lead ${result.reference_number || "—"}`
                    : `Receptie ${result.reference_number || "—"}`}
                </div>

                <div>
                  <b>SKU:</b> {result.sku || "—"}
                </div>

                <div>
                  <b>Omschrijving:</b> {result.description || "—"}
                </div>

                <div>
                  <b>Gebruikte parts:</b> {result.used_parts || "—"}
                </div>

                <div>
                  <b>Batterij status:</b> {result.battery_status || "—"}
                </div>

                <div>
                  <b>Aankoopdatum:</b> {result.purchase_date || "—"}
                </div>

                <div>
                  <b>Leverancier:</b> {result.supplier || "—"}
                </div>

                {result.link && (
                  <Link
                    href={result.link}
                    className="inline-block pt-2 text-blue-600 underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
