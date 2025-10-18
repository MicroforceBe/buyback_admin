import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";
import { InlineSaveButton } from "./InlineSave";

// Server component settings
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  order_code: string;
  created_at: string | null;

  model: string | null;
  capacity_gb: number | null;
  base_price_cents: number | null;
  final_price_cents: number | null;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  iban: string | null;

  status:
    | "new"
    | "received_store"
    | "label_created"
    | "shipment_received"
    | "check_passed"
    | "check_failed"
    | "done"
    | string
    | null;

  admin_note: string | null;
  updated_at: string | null;

  answers: any;
};

type SearchParams = {
  // vrij zoeken
  q?: string;

  // filters
  status?: string;         // exact
  method?: "ship" | "dropoff" | ""; // leveringsmethode
  voucher?: "yes" | "no" | ""; // via answers JSON: { voucher: true/false }
  only?: "new" | "done" | ""; // toggles

  // datum range
  from?: string;
  to?: string;

  // sort & page
  sort?: string;
  dir?: "asc" | "desc";
  page?: string;
  limit?: string;
};

function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return ts;
  }
}

function centsToEUR(c?: number | null) {
  if (!c && c !== 0) return "—";
  return (c / 100).toFixed(2).replace(".", ",");
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // ====== zoek & filter parameters ======
  const q = (searchParams.q ?? "").trim();

  const statusF = (searchParams.status ?? "").trim(); // exact status
  const method = (searchParams.method ?? "") as "" | "ship" | "dropoff";
  const voucher = (searchParams.voucher ?? "") as "" | "yes" | "no";
  const only = (searchParams.only ?? "") as "" | "new" | "done";

  const from = (searchParams.from ?? "").trim();
  const to = (searchParams.to ?? "").trim();

  const sort = (searchParams.sort ?? "created_at");
  const dir = (searchParams.dir ?? "desc") as "asc" | "desc";

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;

  // ====== base select ======
  let query = supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id",
        "order_code",
        "created_at",
        "model",
        "capacity_gb",
        "base_price_cents",
        "final_price_cents",
        "first_name",
        "last_name",
        "email",
        "phone",
        "delivery_method",
        "shop_location",
        "street",
        "house_number",
        "postal_code",
        "city",
        "country",
        "iban",
        "status",
        "admin_note",
        "updated_at",
        "answers",
      ].join(","),
      { count: "exact" }
    );

  // ====== vrije zoekterm ======
  if (q) {
    query = query.or(
      [
        `order_code.ilike.%${q}%`,
        `model.ilike.%${q}%`,
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `city.ilike.%${q}%`,
        `shop_location.ilike.%${q}%`,
      ].join(",")
    );
  }

  // ====== filters ======
  if (statusF) query = query.eq("status", statusF);
  if (only === "new") query = query.eq("status", "new");
  if (only === "done") query = query.eq("status", "done");
  if (method) query = query.eq("delivery_method", method);

  // Voucherfilter via answers JSON (contains)
  // Verwacht dat answers een JSONB is met bv { voucher: true/false }
  if (voucher === "yes") query = query.contains("answers", { voucher: true } as any);
  if (voucher === "no") query = query.contains("answers", { voucher: false } as any);

  // Datumrange (created_at)
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  // Sorteren
  const sortable = new Set(["order_code", "created_at", "model", "capacity_gb", "final_price_cents", "status"]);
  const sortCol = sortable.has(sort) ? sort : "created_at";
  query = query.order(sortCol as any, { ascending: dir === "asc" });

  // Paging
  query = query.range(offset, offset + limit - 1);

  // ====== fetch ======
  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;
  try {
    const res = (await query) as unknown as { data: Lead[] | null; error: any; count: number | null };
    data = res.data;
    error = res.error;
    count = res.count;
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">Fout bij laden</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {error?.message || JSON.stringify(error)}
          </pre>
        </div>
      </div>
    );
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const qsBase: Record<string, string> = {};
  if (q) qsBase.q = q;
  if (statusF) qsBase.status = statusF;
  if (method) qsBase.method = method;
  if (voucher) qsBase.voucher = voucher;
  if (only) qsBase.only = only;
  if (from) qsBase.from = from;
  if (to) qsBase.to = to;
  if (sort) qsBase.sort = sort;
  if (dir) qsBase.dir = dir;
  qsBase.limit = String(limit);

  const makeSortHref = (col: string) => {
    const sp = new URLSearchParams(qsBase);
    const nextDir = sort === col && dir === "asc" ? "desc" : "asc";
    sp.set("sort", col);
    sp.set("dir", nextDir);
    sp.set("page", "1");
    return `?${sp.toString()}`;
    };
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(qsBase);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };

  // helper om “undo” forms te maken
  function UndoForm({ id, field, valueLabel, restore }: { id: string; field: "status" | "final_price_eur"; valueLabel: string; restore: string }) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, restore);
    // Niet vooraf submitten — we renderen gewoon het formulier
    return (
      <form action={updateLeadInlineAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name={field} value={restore} />
        <button className="bb-btn subtle" type="submit" title={`Zet terug naar ${valueLabel}`}>
          ↩ Ongedaan maken
        </button>
      </form>
    );
  }

  return (
    <div className="w-full p-4 space-y-4">
      {/* Kop + globale acties */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <div className="flex gap-2">
          <Link href={`/admin/leads/export?download=1`} className="bb-btn">⬇︎ Export CSV</Link>
          <Link href="/admin" className="bb-btn">← Terug</Link>
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3 p-3 border rounded-lg bg-white" method="GET">
        {/* behoud bestaande qs */}
        {Object.entries(qsBase).map(([k, v]) =>
          !["q", "status", "method", "voucher", "only", "from", "to", "limit", "page"].includes(k) ? (
            <input key={k} type="hidden" name={k} value={v} />
          ) : null
        )}

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Zoek overal</label>
          <input name="q" defaultValue={q} placeholder="Zoek order, klant, model…" className="bb-input w-[240px]" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Status</label>
          <select name="status" defaultValue={statusF} className="bb-select w-[210px]">
            <option value="">(alle)</option>
            <option value="new">Nieuw</option>
            <option value="received_store">Ontvangen in winkel</option>
            <option value="label_created">Verzendlabel aangemaakt</option>
            <option value="shipment_received">Zending ontvangen</option>
            <option value="check_passed">Controle succesvol</option>
            <option value="check_failed">Controle gefaald</option>
            <option value="done">Afgewerkt</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Levering</label>
          <select name="method" defaultValue={method} className="bb-select w-[160px]">
            <option value="">(alle)</option>
            <option value="ship">Verzenden</option>
            <option value="dropoff">Binnenbrengen</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Voucher</label>
          <select name="voucher" defaultValue={voucher} className="bb-select w-[150px]">
            <option value="">(alle)</option>
            <option value="yes">Met voucher</option>
            <option value="no">Zonder voucher</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Alleen</label>
          <select name="only" defaultValue={only} className="bb-select w-[170px]">
            <option value="">(n.v.t.)</option>
            <option value="new">Alleen nieuwe</option>
            <option value="done">Alleen afgewerkte</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Van</label>
          <input type="date" name="from" defaultValue={from} className="bb-input" />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Tot</label>
          <input type="date" name="to" defaultValue={to} className="bb-input" />
        </div>

        <div className="flex items-end gap-2">
          <select name="limit" defaultValue={String(limit)} className="bb-select">
            <option value="25">25 / p</option>
            <option value="50">50 / p</option>
            <option value="100">100 / p</option>
          </select>
          <button className="bb-btn primary" type="submit">Filteren</button>
          <Link href="/admin/leads" className="bb-btn subtle">Reset</Link>
        </div>
      </form>

      {/* Tabel */}
      <div className="overflow-auto">
        <table className="w-full text-sm border border-gray-200">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[160px]">
                <a href={makeSortHref("order_code")} className="font-semibold hover:underline">Order ID</a>
                <div className="text-[11px] text-gray-500">klik om orderdetails te tonen</div>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[170px]">
                <a href={makeSortHref("created_at")} className="font-semibold hover:underline">Datum</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[260px]">
                <span className="font-semibold">Klant</span>
                <div className="text-[11px] text-gray-500">klik om klantinfo te tonen</div>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[260px]">
                <a href={makeSortHref("model")} className="font-semibold hover:underline">Model</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[120px]">
                <a href={makeSortHref("capacity_gb")} className="font-semibold hover:underline">Variant</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[180px]">
                <a href={makeSortHref("final_price_cents")} className="font-semibold hover:underline">Prijs (EUR)</a>
              </th>
              <th className="px-3 py-2 border-b border-gray-200 w-[220px]">
                <span className="font-semibold">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((lead, idx) => {
              const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
              const variantLabel = lead.capacity_gb ? `${lead.capacity_gb} GB` : "—";

              return (
                <tr key={lead.id} className={`border-t border-gray-200 ${idx % 2 === 0 ? "bg-gray-50" : "bg-green-50"}`}>
                  {/* Order + details */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    <details>
                      <summary className="cursor-pointer font-mono">{lead.order_code}</summary>
                      <div className="mt-2 text-xs leading-5 space-y-2">
                        <div className="font-semibold text-gray-700">Volledige orderinfo</div>
                        <div><span className="text-gray-500">Aangemaakt: </span>{fmtDate(lead.created_at)}</div>
                        <div><span className="text-gray-500">Model: </span>{lead.model ?? "—"} {lead.capacity_gb ? `• ${lead.capacity_gb} GB` : ""}</div>
                        <div><span className="text-gray-500">Email: </span>{lead.email ?? "—"}</div>
                        <div><span className="text-gray-500">Tel: </span>{lead.phone ?? "—"}</div>
                        <div><span className="text-gray-500">Levering: </span>
                          {lead.delivery_method === "ship"
                            ? `Verzenden — ${[lead.street, lead.house_number, lead.postal_code, lead.city, lead.country].filter(Boolean).join(" ")}`
                            : lead.delivery_method === "dropoff"
                            ? `Binnenbrengen — ${lead.shop_location ?? "—"}`
                            : "—"}
                        </div>
                        <div className="text-gray-500">Antwoorden:</div>
                        <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto max-h-[220px]">{lead.answers ? JSON.stringify(lead.answers, null, 2) : "—"}</pre>
                        <div className="pt-1">
                          <form action={deleteLeadAction}>
                            <input type="hidden" name="id" value={lead.id} />
                            <button className="bb-btn danger" type="submit">Verwijderen</button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </td>

                  {/* Datum */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    {fmtDate(lead.created_at)}
                  </td>

                  {/* Klant + details */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    <details>
                      <summary className="cursor-pointer">{fullName}</summary>
                      <div className="mt-2 text-xs leading-5 space-y-1">
                        <div><span className="text-gray-500">Email: </span>{lead.email ?? "—"}</div>
                        <div><span className="text-gray-500">Tel: </span>{lead.phone ?? "—"}</div>
                        <div><span className="text-gray-500">Adres: </span>
                          {[lead.street, lead.house_number, lead.postal_code, lead.city, lead.country].filter(Boolean).join(" ") || "—"}
                        </div>
                        <div><span className="text-gray-500">IBAN: </span>{lead.iban ?? "—"}</div>
                      </div>
                    </details>
                  </td>

                  {/* Model */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    {lead.model ?? "—"}
                  </td>

                  {/* Variant */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    {variantLabel}
                  </td>

                  {/* Prijs (editable + undo) */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top">
                    <div className="flex items-center gap-2">
                      <form action={updateLeadInlineAction} className="flex items-center gap-2"
                            // 2.4 Enter-to-save + autofocus
                            >
                        <input type="hidden" name="id" value={lead.id} />
                        <input
                          name="final_price_eur"
                          defaultValue={((lead.final_price_cents ?? 0) / 100).toString()}
                          className="bb-input w-28"
                          inputMode="decimal"
                          placeholder="0,00"
                          autoComplete="off"
                          onKeyDownCapture={(e) => {
                            // Enter submit hint (client hint – geen runtime error als server rendert)
                            // @ts-ignore
                            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).form?.requestSubmit();
                          }}
                        />
                        {/* 2.2 visuele pending feedback */}
                        <InlineSaveButton />
                      </form>

                      {/* 2.3 Undo naar vorige waarde */}
                      {typeof lead.final_price_cents === "number" && (
                        <UndoForm
                          id={lead.id}
                          field="final_price_eur"
                          valueLabel={`${centsToEUR(lead.final_price_cents)} €`}
                          restore={String((lead.final_price_cents / 100).toFixed(2))}
                        />
                      )}
                    </div>
                  </td>

                  {/* Status (editable + undo) */}
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <form action={updateLeadInlineAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={lead.id} />
                        <select name="status" defaultValue={lead.status ?? "new"} className="bb-select">
                          <option value="new">Nieuw</option>
                          <option value="received_store">Ontvangen in winkel</option>
                          <option value="label_created">Verzendlabel aangemaakt</option>
                          <option value="shipment_received">Zending ontvangen</option>
                          <option value="check_passed">Controle succesvol</option>
                          <option value="check_failed">Controle gefaald</option>
                          <option value="done">Afgewerkt</option>
                        </select>
                        <InlineSaveButton />
                      </form>

                      {/* 2.3 Undo naar vorige status (indien aanwezig) */}
                      {lead.status && (
                        <UndoForm
                          id={lead.id}
                          field="status"
                          valueLabel={lead.status}
                          restore={lead.status}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Geen resultaten
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      <div className="flex items-center justify-center gap-2">
        {page > 1 ? (
          <Link className="bb-btn" href={pageHref(page - 1)}>
            ← Vorige
          </Link>
        ) : (
          <span className="bb-btn" aria-disabled>← Vorige</span>
        )}
        <span className="text-sm text-gray-600">
          Pagina {page} / {totalPages} • Totaal {total}
        </span>
        {page < totalPages ? (
          <Link className="bb-btn" href={pageHref(page + 1)}>
            Volgende →
          </Link>
        ) : (
          <span className="bb-btn" aria-disabled>Volgende →</span>
        )}
      </div>
    </div>
  );
}
