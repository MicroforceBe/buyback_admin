import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";
import { InlineSaveButton } from "./InlineSave";

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
  // globale zoek & filters
  q?: string;
  status?: string;               // exact
  method?: "ship" | "dropoff" | "";
  voucher?: "yes" | "no" | "";
  only?: "new" | "done" | "";
  from?: string;
  to?: string;

  // kolomfilters
  oc?: string;       // order_code
  name?: string;     // first_name/last_name
  mdl?: string;      // model
  var?: string;      // capacity_gb exact int
  pmin?: string;     // prijs min (EUR)
  pmax?: string;     // prijs max (EUR)

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
  if (c == null) return "—";
  return (c / 100).toFixed(2).replace(".", ",");
}

function eurToCentsSafe(s?: string) {
  if (!s) return undefined;
  const x = s.trim().replace(",", ".");
  if (!x) return undefined;
  const n = Number(x);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

// badge kleur per status
function statusBadgeCls(s?: string | null) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border";
  switch (s) {
    case "new":
      return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    case "received_store":
      return `${base} bg-indigo-50 text-indigo-700 border-indigo-200`;
    case "label_created":
      return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    case "shipment_received":
      return `${base} bg-cyan-50 text-cyan-700 border-cyan-200`;
    case "check_passed":
      return `${base} bg-green-50 text-green-700 border-green-200`;
    case "check_failed":
      return `${base} bg-red-50 text-red-700 border-red-200`;
    case "done":
      return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    default:
      return `${base} bg-gray-50 text-gray-700 border-gray-200`;
  }
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // ===== query params =====
  const q = (searchParams.q ?? "").trim();
  const statusF = (searchParams.status ?? "").trim();
  const method = (searchParams.method ?? "") as "" | "ship" | "dropoff";
  const voucher = (searchParams.voucher ?? "") as "" | "yes" | "no";
  const only = (searchParams.only ?? "") as "" | "new" | "done";
  const from = (searchParams.from ?? "").trim();
  const to = (searchParams.to ?? "").trim();

  // kolomfilters
  const oc = (searchParams.oc ?? "").trim();
  const name = (searchParams.name ?? "").trim();
  const mdl = (searchParams.mdl ?? "").trim();
  const varTxt = (searchParams.var ?? "").trim();
  const pmin = (searchParams.pmin ?? "").trim();
  const pmax = (searchParams.pmax ?? "").trim();

  const pminC = eurToCentsSafe(pmin);
  const pmaxC = eurToCentsSafe(pmax);
  const varNum = varTxt ? parseInt(varTxt, 10) : undefined;

  // sort & paging
  const sort = (searchParams.sort ?? "created_at");
  const dir = (searchParams.dir ?? "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;

  // ===== base select =====
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
        //"answers",
      ].join(","),
      { count: "exact" }
    );

  // vrije zoekterm
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

  // globale filters
  if (statusF) query = query.eq("status", statusF);
  if (only === "new") query = query.eq("status", "new");
  if (only === "done") query = query.eq("status", "done");
  if (method) query = query.eq("delivery_method", method);
  //if (voucher === "yes") query = query.contains("answers", { voucher: true } as any);
  //if (voucher === "no") query = query.contains("answers", { voucher: false } as any);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  // kolomfilters
  if (oc) query = query.ilike("order_code", `%${oc}%`);
  if (name) {
    query = query.or(
      [
        `first_name.ilike.%${name}%`,
        `last_name.ilike.%${name}%`,
        `email.ilike.%${name}%`,
        `phone.ilike.%${name}%`,
      ].join(",")
    );
  }
  if (mdl) query = query.ilike("model", `%${mdl}%`);
  if (varNum != null && !Number.isNaN(varNum)) query = query.eq("capacity_gb", varNum);
  if (pminC != null) query = query.gte("final_price_cents", pminC);
  if (pmaxC != null) query = query.lte("final_price_cents", pmaxC);

  // sort & paging
  const sortable = new Set(["order_code", "created_at", "model", "capacity_gb", "final_price_cents", "status"]);
  const sortCol = sortable.has(sort) ? sort : "created_at";
  query = query.order(sortCol as any, { ascending: dir === "asc" }).range(offset, offset + limit - 1);

  // fetch
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

  // querystring helper
  const qsBase: Record<string, string> = {};
  const keep = (k: string, v?: string) => {
    if (v) qsBase[k] = v;
  };
  keep("q", q);
  keep("status", statusF);
  keep("method", method);
  keep("voucher", voucher);
  keep("only", only);
  keep("from", from);
  keep("to", to);
  keep("oc", oc);
  keep("name", name);
  keep("mdl", mdl);
  keep("var", varTxt);
  keep("pmin", pmin);
  keep("pmax", pmax);
  keep("sort", sort);
  keep("dir", dir);
  qsBase["limit"] = String(limit);

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

  // Kolomfilters formulier (zorgt dat kolommen mooi alignen)
  const ColumnFilters = () => (
    <form className="grid grid-cols-7 gap-[1px] bg-gray-200 rounded overflow-hidden" method="GET">
      {/* Hidden: bewaar alle bestaande filters in deze submit */}
      {Object.entries(qsBase).map(([k, v]) =>
        !["oc","name","mdl","var","pmin","pmax","page"].includes(k) ? (
          <input key={k} type="hidden" name={k} value={v} />
        ) : null
      )}

      <div className="bg-white px-2 py-1">
        <input
          name="oc"
          defaultValue={oc}
          placeholder="Filter ID…"
          className="bb-input w-full"
        />
      </div>
      <div className="bg-white px-2 py-1">
        <input
          name="from"
          defaultValue={from}
          type="date"
          className="bb-input w-full"
          title="Datum van (bovenaan is werkelijke datumkolom)"
        />
      </div>
      <div className="bg-white px-2 py-1">
        <input
          name="name"
          defaultValue={name}
          placeholder="Filter klantnaam…"
          className="bb-input w-full"
        />
      </div>
      <div className="bg-white px-2 py-1">
        <input
          name="mdl"
          defaultValue={mdl}
          placeholder="Filter model…"
          className="bb-input w-full"
        />
      </div>
      <div className="bg-white px-2 py-1">
        <input
          name="var"
          defaultValue={varTxt}
          placeholder="GB…"
          inputMode="numeric"
          className="bb-input w-full"
        />
      </div>
      <div className="bg-white px-2 py-1">
        <div className="flex gap-1">
          <input
            name="pmin"
            defaultValue={pmin}
            placeholder="Min €"
            inputMode="decimal"
            className="bb-input w-full"
          />
          <input
            name="pmax"
            defaultValue={pmax}
            placeholder="Max €"
            inputMode="decimal"
            className="bb-input w-full"
          />
        </div>
      </div>
      <div className="bg-white px-2 py-1">
        <div className="flex gap-1">
          <button className="bb-btn primary w-full" type="submit">Toepassen</button>
          <Link href="/admin/leads" className="bb-btn subtle">Reset</Link>
        </div>
      </div>
    </form>
  );

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

      {/* Globale filters */}
      <form className="flex flex-wrap items-end gap-3 p-3 border rounded-lg bg-white" method="GET">
        {Object.entries(qsBase).map(([k, v]) =>
          !["q","status","method","voucher","only","from","to","limit","page","oc","name","mdl","var","pmin","pmax"].includes(k) ? (
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
        </table>

        {/* Kolomfilters (uitgelijnd met 7 kolommen) */}
        <div className="mt-0">
          <ColumnFilters />
        </div>

        {/* Data-rows */}
        <table className="w-full text-sm border-x border-b border-gray-200">
          <tbody>
            {(data ?? []).map((lead, idx) => {
              const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
              const variantLabel = lead.capacity_gb ? `${lead.capacity_gb} GB` : "—";

              return (
                <tr key={lead.id} className={`border-t border-gray-200 ${idx % 2 === 0 ? "bg-gray-50" : "bg-green-50"}`}>
                  {/* Order + details */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[160px]">
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
                       /* <div className="text-gray-500">Antwoorden:</div>
                        <pre className="bg-white border border-gray-200 rounded p-2 overflow-auto max-h-[220px]">{lead.answers ? JSON.stringify(lead.answers, null, 2) : "—"}</pre>
                        */
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
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[170px]">
                    {fmtDate(lead.created_at)}
                  </td>

                  {/* Klant + details */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[260px]">
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
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[260px]">
                    {lead.model ?? "—"}
                  </td>

                  {/* Variant */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[120px]">
                    {variantLabel}
                  </td>

                  {/* Prijs (editable + undo) */}
                  <td className="px-3 py-2 border-r border-gray-200 align-top w-[180px]">
                    <div className="flex items-center gap-2">
                      <form action={updateLeadInlineAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={lead.id} />
                        <input
                          name="final_price_eur"
                          defaultValue={((lead.final_price_cents ?? 0) / 100).toString()}
                          className="bb-input w-28"
                          inputMode="decimal"
                          placeholder="0,00"
                          autoComplete="off"
                          onKeyDownCapture={(e) => {
                            // @ts-ignore
                            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).form?.requestSubmit();
                          }}
                        />
                        <InlineSaveButton />
                      </form>

                      {typeof lead.final_price_cents === "number" && (
                        <form action={updateLeadInlineAction}>
                          <input type="hidden" name="id" value={lead.id} />
                          <input type="hidden" name="final_price_eur" value={String((lead.final_price_cents / 100).toFixed(2))} />
                          <button className="bb-btn subtle" type="submit" title={`Zet terug naar ${centsToEUR(lead.final_price_cents)} €`}>
                            ↩ Ongedaan maken
                          </button>
                        </form>
                      )}
                    </div>
                  </td>

                  {/* Status (badge + editable + undo) */}
                  <td className="px-3 py-2 align-top w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* badge */}
                      <span className={statusBadgeCls(lead.status)}>{lead.status ?? "onbekend"}</span>

                      {/* editor */}
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

                      {/* Undo (naar huidige status) */}
                      {lead.status && (
                        <form action={updateLeadInlineAction}>
                          <input type="hidden" name="id" value={lead.id} />
                          <input type="hidden" name="status" value={lead.status} />
                          <button className="bb-btn subtle" type="submit" title={`Zet terug naar ${lead.status}`}>
                            ↩ Ongedaan maken
                          </button>
                        </form>
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
