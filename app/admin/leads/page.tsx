import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  order_code: string | null;
  created_at: string | null;

  // toestel
  model: string | null;
  capacity_gb: number | null;

  // prijzen
  base_price_cents: number | null;
  final_price_cents: number | null;

  // klant
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  // levering
  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  // betaling
  iban: string | null;

  // admin
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

  // NB: answers zit wél in de tabel, maar we selecteren het niet om lijstweergave licht te houden.
};

type SearchParams = {
  // globaal
  q?: string;
  from?: string;
  to?: string;

  // kolomfilters
  order?: string;
  customer?: string;
  model?: string;
  variant?: string; // capacity GB
  status?: string;
  method?: "ship" | "dropoff" | "";
  price_min?: string;
  price_max?: string;
  city?: string;
  shop?: string;
  voucher?: "yes" | "no" | "";

  // sort/paging
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
    return ts ?? "—";
  }
}

// helper om QS te bouwen met overrides
function qsWith(base: Record<string, string>, patch: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams(base);
  Object.entries(patch).forEach(([k, v]) => {
    if (v == null) sp.delete(k);
    else sp.set(k, v);
  });
  return `?${sp.toString()}`;
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // === params ===
  const q = (searchParams.q ?? "").trim();
  const from = (searchParams.from ?? "").trim();
  const to = (searchParams.to ?? "").trim();

  const order = (searchParams.order ?? "").trim();
  const customer = (searchParams.customer ?? "").trim();
  const modelF = (searchParams.model ?? "").trim();
  const variant = (searchParams.variant ?? "").trim();
  const statusF = (searchParams.status ?? "").trim();
  const method = (searchParams.method ?? "").trim() as "ship" | "dropoff" | "";
  const priceMin = (searchParams.price_min ?? "").trim();
  const priceMax = (searchParams.price_max ?? "").trim();
  const cityF = (searchParams.city ?? "").trim();
  const shop = (searchParams.shop ?? "").trim();
  const voucher = (searchParams.voucher ?? "").trim() as "yes" | "no" | "";

  const sort = searchParams.sort ?? "created_at";
  const dir = (searchParams.dir ?? "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;

  // === query ===
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
      ].join(","),
      { count: "exact" }
    );

  // Globale zoek
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

  // Datum range
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  // Kolomfilters
  if (order) query = query.ilike("order_code", `%${order}%`);
  if (customer) {
    query = query.or(
      [
        `first_name.ilike.%${customer}%`,
        `last_name.ilike.%${customer}%`,
        `email.ilike.%${customer}%`,
        `phone.ilike.%${customer}%`,
      ].join(",")
    );
  }
  if (modelF) query = query.ilike("model", `%${modelF}%`);
  if (variant) {
    const n = parseInt(variant, 10);
    if (!Number.isNaN(n)) query = query.eq("capacity_gb", n);
  }
  if (statusF) query = query.eq("status", statusF);
  if (method === "ship" || method === "dropoff") query = query.eq("delivery_method", method);
  if (priceMin) {
    const cents = Math.round(parseFloat(priceMin.replace(",", ".")) * 100);
    if (!Number.isNaN(cents)) query = query.gte("final_price_cents", cents);
  }
  if (priceMax) {
    const cents = Math.round(parseFloat(priceMax.replace(",", ".")) * 100);
    if (!Number.isNaN(cents)) query = query.lte("final_price_cents", cents);
  }
  if (cityF) query = query.ilike("city", `%${cityF}%`);
  if (shop) query = query.ilike("shop_location", `%${shop}%`);

  // Voucher via JSON path (server side): we filteren niet hier om select slank te houden.
  // (Als je absoluut server-side voucherfilter wil, moeten we 'answers' selecteren.)
  if (voucher) {
    // light-weight fallback: client-side chip laat zien wat actief is; server-side filter laten we achterwege
    // of: je kan er voor kiezen om wél answers te selecteren en hier eq/is logica toevoegen.
  }

  // sorteerbare kolommen
  const sortable = new Set(["order_code", "created_at", "model", "capacity_gb", "final_price_cents", "status"]);
  const sortCol = sortable.has(sort) ? sort : "created_at";
  query = query.order(sortCol as any, { ascending: dir === "asc" });

  // paginatie
  query = query.range(offset, offset + limit - 1);

  // execute
  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;
  try {
    const res = (await query) as unknown as { data: Lead[] | null; error: any; count: number | null };
    data = res.data ?? [];
    error = res.error ?? null;
    count = res.count ?? 0;
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>
        <div className="p-3 bg-red-50 border border-red-200 rounded">
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

  // base QS voor sort/paging behoud
  const qsBase: Record<string, string> = {};
  const kv: Record<string, string | undefined> = {
    q,
    from,
    to,
    order,
    customer,
    model: modelF,
    variant,
    status: statusF,
    method,
    price_min: priceMin,
    price_max: priceMax,
    city: cityF,
    shop,
    voucher,
    sort,
    dir,
    limit: String(limit),
  };
  Object.entries(kv).forEach(([k, v]) => {
    if (v && v !== "") qsBase[k] = v;
  });

  const hasActiveFilters = Object.keys(qsBase).some((k) =>
    ["q","from","to","order","customer","model","variant","status","method","price_min","price_max","city","shop","voucher"].includes(k)
  );

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

  const inputCls = "bb-input h-8 text-xs px-2";
  const selectCls = "bb-select h-8 text-xs px-2";
  const btnCls = "bb-btn h-8 text-xs px-3";

  // Chips voor actieve filters
  const chipItems: { label: string; param: keyof SearchParams; value: string }[] = [];
  const pushChip = (label: string, param: keyof SearchParams, value?: string) => {
    if (value && value !== "") chipItems.push({ label, param, value });
  };
  pushChip(`Zoek: ${q}`, "q", q);
  pushChip(`Van: ${from}`, "from", from);
  pushChip(`Tot: ${to}`, "to", to);
  pushChip(`Order: ${order}`, "order", order);
  pushChip(`Klant: ${customer}`, "customer", customer);
  pushChip(`Model: ${modelF}`, "model", modelF);
  pushChip(`GB: ${variant}`, "variant", variant);
  pushChip(`Status: ${statusF}`, "status", statusF);
  pushChip(`Methode: ${method}`, "method", method);
  pushChip(`€ min: ${priceMin}`, "price_min", priceMin);
  pushChip(`€ max: ${priceMax}`, "price_max", priceMax);
  pushChip(`Stad: ${cityF}`, "city", cityF);
  pushChip(`Winkel: ${shop}`, "shop", shop);
  pushChip(`Voucher: ${voucher}`, "voucher", voucher);

  const chip = (c: (typeof chipItems)[number]) => {
    const href = qsWith(qsBase, { [c.param]: null, page: "1" });
    return (
      <Link
        key={`${c.param}:${c.value}`}
        href={href}
        className="inline-flex items-center gap-1 text-xs px-2 h-6 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-200"
        title="Filter verwijderen"
      >
        <span className="font-medium">{c.label}</span>
        <span aria-hidden>❌</span>
      </Link>
    );
  };

  const resetHref = qsWith(qsBase, {
    q: null, from: null, to: null,
    order: null, customer: null, model: null, variant: null,
    status: null, method: null, price_min: null, price_max: null,
    city: null, shop: null, voucher: null, page: "1"
  });

  return (
    <div className="w-full p-4 space-y-3">
      {/* Kop */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/admin" className={btnCls}>← Terug</Link>
      </div>

      {/* Chips + togglebare filtersectie */}
      <div className="space-y-2">
        {/* Actieve filterchips */}
        {chipItems.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Actieve filters:</span>
            {chipItems.map(chip)}
            <Link href={resetHref} className="text-xs underline text-gray-600 hover:text-gray-900">
              Alles wissen
            </Link>
          </div>
        )}

        <details className="border rounded-lg bg-white" {...(hasActiveFilters ? { open: true } : {})}>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center gap-2">
            Filters {hasActiveFilters ? <span className="text-xs text-gray-500">({chipItems.length} actief)</span> : null}
          </summary>

          <form className="p-3 pt-0">
            {/* verstopte QS die we willen bewaren */}
            {Object.entries(qsBase).map(([k, v]) =>
              ![
                "q","from","to","order","customer","model","variant","status",
                "method","price_min","price_max","city","shop","voucher","limit","page"
              ].includes(k) ? <input key={k} type="hidden" name={k} value={v} /> : null
            )}

            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              <input name="q" defaultValue={q} placeholder="Zoek overal…" className={inputCls} />
              <input type="date" name="from" defaultValue={from} className={inputCls} />
              <input type="date" name="to" defaultValue={to} className={inputCls} />

              <input name="order" defaultValue={order} placeholder="Order ID" className={inputCls} />
              <input name="customer" defaultValue={customer} placeholder="Klant (naam/email/tel)" className={inputCls} />
              <input name="model" defaultValue={modelF} placeholder="Model" className={inputCls} />
              <input name="variant" defaultValue={variant} placeholder="GB" className={inputCls} />

              <select name="status" defaultValue={statusF} className={selectCls}>
                <option value="">Status</option>
                <option value="new">Nieuw</option>
                <option value="received_store">Ontvangen in winkel</option>
                <option value="label_created">Verzendlabel aangemaakt</option>
                <option value="shipment_received">Zending ontvangen</option>
                <option value="check_passed">Controle succesvol</option>
                <option value="check_failed">Controle gefaald</option>
                <option value="done">Afgewerkt</option>
              </select>

              <select name="method" defaultValue={method} className={selectCls}>
                <option value="">Methode</option>
                <option value="ship">Verzenden</option>
                <option value="dropoff">Binnenbrengen</option>
              </select>

              <input name="price_min" defaultValue={priceMin} placeholder="€ min" className={inputCls} inputMode="decimal" />
              <input name="price_max" defaultValue={priceMax} placeholder="€ max" className={inputCls} inputMode="decimal" />
              <input name="city" defaultValue={cityF} placeholder="Stad" className={inputCls} />
              <input name="shop" defaultValue={shop} placeholder="Winkel" className={inputCls} />

              <select name="voucher" defaultValue={voucher} className={selectCls}>
                <option value="">Voucher</option>
                <option value="yes">Ja</option>
                <option value="no">Nee/ontbreekt</option>
              </select>

              <select name="limit" defaultValue={String(limit)} className={selectCls}>
                <option value="25">25/p</option>
                <option value="50">50/p</option>
                <option value="100">100/p</option>
              </select>

              <div className="col-span-2 sm:col-span-1 flex gap-2">
                <button className={`${btnCls} primary`} type="submit">Filter</button>
                <Link href={resetHref} className={`${btnCls} subtle`}>Reset</Link>
              </div>
            </div>
          </form>
        </details>
      </div>

      {/* Tabel */}
      <div className="overflow-auto">
        <table className="w-full text-sm border border-gray-200">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[180px]">
                <a href={makeSortHref("created_at")} className="font-semibold hover:underline">Order ID</a>
                <div className="text-[11px] text-gray-500">klik om orderdetails te tonen</div>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[150px]">
                <a href={makeSortHref("created_at")} className="font-semibold hover:underline">Datum</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[240px]">
                <span className="font-semibold">Klant</span>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[240px]">
                <a href={makeSortHref("model")} className="font-semibold hover:underline">Model</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[110px]">
                <a href={makeSortHref("capacity_gb")} className="font-semibold hover:underline">Variant</a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[150px]">
                <a href={makeSortHref("final_price_cents")} className="font-semibold hover:underline">Prijs (€)</a>
              </th>
              <th className="px-3 py-2 border-b border-gray-200 w-[200px]">
                <span className="font-semibold">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((lead, idx) => (
              <tr
                key={lead.id}
                className={`border-t border-gray-200 ${idx % 2 === 0 ? "bg-gray-50" : "bg-green-50"}`}
              >
                {/* Order ID + uitklap: orderdetails */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <details>
                    <summary className="cursor-pointer font-mono">{lead.order_code ?? "—"}</summary>
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

                {/* Klantnaam + uitklap met klantdetails */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <details>
                    <summary className="cursor-pointer">
                      {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                    </summary>
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

                {/* Variant (capacity) */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  {lead.capacity_gb ? `${lead.capacity_gb} GB` : "—"}
                </td>

                {/* Prijs (inline editable) */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <form action={updateLeadInlineAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <input
                      name="final_price_eur"
                      defaultValue={((lead.final_price_cents ?? 0) / 100).toString()}
                      className="bb-input h-8 text-xs px-2 w-24"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                    <button className="bb-btn subtle h-8 text-xs px-2" type="submit" title="Opslaan">💾</button>
                  </form>
                </td>

                {/* Status (inline editable) */}
                <td className="px-3 py-2 align-top">
                  <form action={updateLeadInlineAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <select name="status" defaultValue={lead.status ?? "new"} className="bb-select h-8 text-xs px-2">
                      <option value="new">Nieuw</option>
                      <option value="received_store">Ontvangen in winkel</option>
                      <option value="label_created">Verzendlabel aangemaakt</option>
                      <option value="shipment_received">Zending ontvangen</option>
                      <option value="check_passed">Controle succesvol</option>
                      <option value="check_failed">Controle gefaald</option>
                      <option value="done">Afgewerkt</option>
                    </select>
                    <button className="bb-btn subtle h-8 text-xs px-2" type="submit" title="Opslaan">💾</button>
                  </form>
                </td>
              </tr>
            ))}

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
          <Link className="bb-btn h-8 text-xs px-3" href={pageHref(page - 1)}>
            ← Vorige
          </Link>
        ) : (
          <span className="bb-btn h-8 text-xs px-3" aria-disabled>
            ← Vorige
          </span>
        )}
        <span className="text-xs text-gray-600">
          Pagina {page} / {totalPages} • Totaal {total}
        </span>
        {page < totalPages ? (
          <Link className="bb-btn h-8 text-xs px-3" href={pageHref(page + 1)}>
            Volgende →
          </Link>
        ) : (
          <span className="bb-btn h-8 text-xs px-3" aria-disabled>
            Volgende →
          </span>
        )}
      </div>
    </div>
  );
}
