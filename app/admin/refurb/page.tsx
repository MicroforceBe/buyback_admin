// app/admin/refurb/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefurbReception = {
  id: string;
  reception_number: string;
  reception_date: string;
  supplier: string;
  vat_scheme: "margin" | "normal";
  supplier_invoice_nr: string;
  internal_invoice_nr: string | null;
};

type SearchResult = {
  source: "Receptie lijst" | "Lead";
  sku: string | null;
  description: string | null;
  used_parts: string | null;
  battery_status: string | null;
  purchase_date: string | null;
  supplier: string | null;
  link?: string;
};

async function getReceptions(): Promise<RefurbReception[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .select(
      "id, reception_number, reception_date, supplier, vat_scheme, supplier_invoice_nr, internal_invoice_nr"
    )
    .order("reception_date", { ascending: false });

  if (error) {
    console.error("[REFURB] error fetching receptions", error);
    return [];
  }

  return data as RefurbReception[];
}

async function searchRefurbDevice(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  const { data: receptionItems, error: receptionErr } = await supabaseAdmin
    .from("refurb_reception_items")
    .select(`
      id,
      reception_id,
      imei,
      serial_number,
      sku,
      description,
      used_parts,
      battery_status,
      refurb_receptions (
        id,
        reception_date,
        supplier
      )
    `)
    .or(`imei.ilike.%${q}%,serial_number.ilike.%${q}%`)
    .limit(25);

  if (receptionErr) {
    console.error("[REFURB] search reception items error", receptionErr);
  }

  for (const item of receptionItems || []) {
    const reception = Array.isArray((item as any).refurb_receptions)
      ? (item as any).refurb_receptions[0]
      : (item as any).refurb_receptions;

    results.push({
      source: "Receptie lijst",
      sku: (item as any).sku || null,
      description: (item as any).description || null,
      used_parts: (item as any).used_parts || null,
      battery_status: (item as any).battery_status || null,
      purchase_date: reception?.reception_date || null,
      supplier: reception?.supplier || null,
      link: reception?.id ? `/admin/refurb/${reception.id}` : undefined,
    });
  }

  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from("leads")
    .select(`
      id,
      imei,
      serial_number,
      sku,
      description,
      used_parts,
      battery_status,
      purchase_date,
      supplier
    `)
    .or(`imei.ilike.%${q}%,serial_number.ilike.%${q}%`)
    .limit(25);

  if (leadsErr) {
    console.error("[REFURB] search leads error", leadsErr);
  }

  for (const lead of leads || []) {
    results.push({
      source: "Lead",
      sku: (lead as any).sku || null,
      description: (lead as any).description || null,
      used_parts: (lead as any).used_parts || null,
      battery_status: (lead as any).battery_status || null,
      purchase_date: (lead as any).purchase_date || null,
      supplier: (lead as any).supplier || null,
      link: (lead as any).id ? `/admin/leads/${(lead as any).id}` : undefined,
    });
  }

  return results;
}

async function deleteRefurbReceptionAction(formData: FormData) {
  "use server";

  const user = await getCurrentAdminUser();
  if (!user || (user as any).role !== "admin") {
    redirect("/admin/refurb?msg=forbidden:not_admin");
  }

  const receptionId = String(formData.get("reception_id") || "").trim();
  if (!receptionId) {
    redirect("/admin/refurb?msg=missing_reception_id");
  }

  const { error: delItemsErr } = await supabaseAdmin
    .from("refurb_reception_items")
    .delete()
    .eq("reception_id", receptionId);

  if (delItemsErr) {
    redirect(`/admin/refurb?msg=delete_items_error:${encodeURIComponent(delItemsErr.message)}`);
  }

  const { error: delRecErr } = await supabaseAdmin
    .from("refurb_receptions")
    .delete()
    .eq("id", receptionId);

  if (delRecErr) {
    redirect(`/admin/refurb?msg=delete_reception_error:${encodeURIComponent(delRecErr.message)}`);
  }

  revalidatePath("/admin/refurb");
  redirect("/admin/refurb?msg=deleted_reception");
}

export default async function RefurbListPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = String(searchParams?.q || "").trim();
  const [receptions, searchResults, user] = await Promise.all([
    getReceptions(),
    searchRefurbDevice(q),
    getCurrentAdminUser(),
  ]);

  const isAdmin = !!user && (user as any).role === "admin";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Refurb receptions</h1>
        <Link href="/admin/refurb/new" className="bb-btn bb-btn-primary text-sm">
          Nieuwe receptie
        </Link>
      </div>

      <details className="rounded-md border bg-white">
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
                <div key={index} className="rounded-md border p-4 text-sm space-y-1">
                  <div>
                    <b>Bron:</b> {result.source}
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
                    <Link href={result.link} className="inline-block pt-2 text-blue-600 underline">
                      Open
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2 py-1 text-left">Receptie nr</th>
            <th className="px-2 py-1 text-left">Datum</th>
            <th className="px-2 py-1 text-left">Leverancier</th>
            <th className="px-2 py-1 text-left">BTW regeling</th>
            <th className="px-2 py-1 text-left">Supplier invoice</th>
            <th className="px-2 py-1 text-left">Intern factuur nr</th>
            {isAdmin && <th className="px-2 py-1 text-left">Acties</th>}
          </tr>
        </thead>

        <tbody>
          {receptions.map((r) => (
            <tr key={r.id} className="border-b hover:bg-slate-50">
              <td className="px-2 py-1">
                <Link href={`/admin/refurb/${r.id}`} className="text-blue-600 underline">
                  {r.reception_number}
                </Link>
              </td>
              <td className="px-2 py-1">{r.reception_date}</td>
              <td className="px-2 py-1">{r.supplier}</td>
              <td className="px-2 py-1">
                {r.vat_scheme === "margin" ? "Margin VAT" : "Normal VAT"}
              </td>
              <td className="px-2 py-1">{r.supplier_invoice_nr}</td>
              <td className="px-2 py-1">{r.internal_invoice_nr || "—"}</td>

              {isAdmin && (
                <td className="px-2 py-1">
                  <details className="inline-block">
                    <summary className="cursor-pointer text-red-600 hover:underline select-none">
                      Verwijderen
                    </summary>

                    <div className="mt-2 p-2 border rounded-md bg-white text-xs space-y-2">
                      <div className="text-slate-700">
                        Ben je zeker dat je receptie{" "}
                        <span className="font-semibold">{r.reception_number}</span>{" "}
                        definitief wil verwijderen?
                        <div className="text-[11px] text-slate-500">
                          (Dit verwijdert ook alle rijen/items.)
                        </div>
                      </div>

                      <form action={deleteRefurbReceptionAction} className="flex items-center gap-2">
                        <input type="hidden" name="reception_id" value={r.id} />
                        <button type="submit" className="bb-btn text-[11px] px-2 h-7">
                          Ja, definitief verwijderen
                        </button>
                      </form>
                    </div>
                  </details>
                </td>
              )}
            </tr>
          ))}

          {receptions.length === 0 && (
            <tr>
              <td className="px-2 py-4 text-slate-500" colSpan={isAdmin ? 7 : 6}>
                Geen recepties gevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
