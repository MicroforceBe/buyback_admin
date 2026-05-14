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
  total_items?: number;
  ready_to_book_count?: number;
  waiting_for_sku_count?: number;
  finished_percent?: number;
};

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

function formatDate(date: string | null | undefined) {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleDateString("nl-BE");
  } catch {
    return date;
  }
}

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

  const receptions = (data || []) as RefurbReception[];
  const receptionIds = receptions.map((r) => r.id);

  if (!receptionIds.length) return receptions;

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("reception_id, refurb_status")
    .in("reception_id", receptionIds);

  if (itemsError) {
    console.error("[REFURB] error fetching reception stats", itemsError);
    return receptions;
  }

  const stats = new Map<
    string,
    {
      total: number;
      readyToBook: number;
      waitingForSku: number;
      finished: number;
    }
  >();

  for (const item of items || []) {
    const receptionId = String((item as any).reception_id || "");
    const status = String((item as any).refurb_status || "")
      .trim()
      .toLowerCase();

    if (!receptionId) continue;

    const curr =
      stats.get(receptionId) || {
        total: 0,
        readyToBook: 0,
        waitingForSku: 0,
        finished: 0,
      };

    curr.total += 1;

    if (status === "ready to book") {
      curr.readyToBook += 1;
    }

    if (status === "waiting for sku") {
      curr.waitingForSku += 1;
    }

    if (
      status === "ready to book" ||
      status === "booked" ||
      status.includes("finished")
    ) {
      curr.finished += 1;
    }

    stats.set(receptionId, curr);
  }

  return receptions.map((r) => {
    const s = stats.get(r.id);
    const total = s?.total || 0;
    const finished = s?.finished || 0;

    return {
      ...r,
      total_items: total,
      ready_to_book_count: s?.readyToBook || 0,
      waiting_for_sku_count: s?.waitingForSku || 0,
      finished_percent: total > 0 ? Math.round((finished / total) * 100) : 0,
    };
  });
}

async function searchRefurbDevice(query: string): Promise<SearchResult[]> {
  const q = query.trim();

  if (!q) return [];

  const results: SearchResult[] = [];

  const { data: receptionItems } = await supabaseAdmin
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
      refurb_receptions (
        id,
        reception_number,
        reception_date,
        supplier
      )
    `)
    .or(`imei_sn.ilike.%${q}%,manual_sn.ilike.%${q}%`)
    .limit(50);

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

  const { data: leads } = await supabaseAdmin
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
      first_name,
      last_name
    `)
    .ilike("imei_sn", `%${q}%`)
    .limit(50);

  for (const lead of leads || []) {
    const firstName = (lead as any).first_name || "";
    const lastName = (lead as any).last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    results.push({
      source: "Lead",
      reference_number: (lead as any).order_code || null,
      sku: (lead as any).sku || null,
      description:
        [
          (lead as any).model,
          (lead as any).capacity_gb ? `${(lead as any).capacity_gb}GB` : null,
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
      purchase_date: formatDate((lead as any).created_at),
      supplier: [(lead as any).customer_number, fullName]
        .filter(Boolean)
        .join(" - ") || null,
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
    redirect(
      `/admin/refurb?msg=delete_items_error:${encodeURIComponent(
        delItemsErr.message
      )}`
    );
  }

  const { error: delRecErr } = await supabaseAdmin
    .from("refurb_receptions")
    .delete()
    .eq("id", receptionId);

  if (delRecErr) {
    redirect(
      `/admin/refurb?msg=delete_reception_error:${encodeURIComponent(
        delRecErr.message
      )}`
    );
  }

  revalidatePath("/admin/refurb");

  redirect("/admin/refurb?msg=deleted_reception");
}

export default async function RefurbListPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
  };
}) {
  const q = String(searchParams?.q || "").trim();

  const [receptions, searchResults, user] = await Promise.all([
    getReceptions(),
    searchRefurbDevice(q),
    getCurrentAdminUser(),
  ]);

  const isAdmin = !!user && (user as any).role === "admin";

  return (
    <div className="space-y-4">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Refurb</h1>

          <p className="text-sm text-slate-500">
            Binnenkomende refurb toestellen verwerken per receptie
          </p>
        </div>

        <Link href="/admin/refurb/new" className="bb-btn bb-btn-primary text-sm">
          Nieuwe receptie
        </Link>
      </div>

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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/refurb/${r.id}`}
                    className="text-blue-600 underline"
                  >
                    {r.reception_number}
                  </Link>

                  {(r.ready_to_book_count ?? 0) > 0 && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold leading-none text-white"
                      title={`${r.ready_to_book_count} ready to book`}
                    >
                      {r.ready_to_book_count}
                    </span>
                  )}

                  {(r.waiting_for_sku_count ?? 0) > 0 && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-[11px] font-bold leading-none text-white"
                      title={`${r.waiting_for_sku_count} waiting for sku`}
                    >
                      {r.waiting_for_sku_count}
                    </span>
                  )}
                </div>

                <div className="mt-0.5 text-[11px] text-slate-500">
                  {r.finished_percent ?? 0}% afgewerkt
                  {typeof r.total_items === "number" && r.total_items > 0
                    ? ` • ${r.total_items} artikel(s)`
                    : ""}
                </div>
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
                        <span className="font-semibold">
                          {r.reception_number}
                        </span>{" "}
                        definitief wil verwijderen?

                        <div className="text-[11px] text-slate-500">
                          (Dit verwijdert ook alle rijen/items.)
                        </div>
                      </div>

                      <form
                        action={deleteRefurbReceptionAction}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="reception_id"
                          value={r.id}
                        />

                        <button
                          type="submit"
                          className="bb-btn text-[11px] px-2 h-7"
                        >
                          Ja, definitief verwijderen
                        </button>
                      </form>
                    </div>
                  </details>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
