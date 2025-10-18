import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  order_code: string;
  created_at: string;

  model: string | null;
  capacity_gb: number | null;

  base_price_cents: number | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;
  voucher_bonus_cents: number | null;
  wants_voucher: boolean | null;

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

  status: "new" | "in_progress" | "done" | null;
  admin_note: string | null;
  updated_at: string | null;
  answers: any;
};

type SearchParams = {
  q?: string;                   // algemene zoekterm
  status?: "new" | "in_progress" | "done" | "";
  method?: "ship" | "dropoff" | "";
  from?: string;
  to?: string;

  // per kolom extra filters (optioneel)
  order_code?: string;
  model?: string;
  email?: string;
  city?: string;

  // sortering
  sort?: string; // kolomnaam
  dir?: "asc" | "desc";

  page?: string;
  limit?: string;
};

function eur(cents?: number | null) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}
function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" });
  } catch { return ts; }
}
function badge(status?: string | null) {
  if (status === "done") return <span className="bb-badge success">Afgehandeld</span>;
  if (status === "in_progress") return <span className="bb-badge warn">In behandeling</span>;
  return <span className="bb-badge">Nieuw</span>;
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  // basis filters
  const q       = (searchParams.q ?? "").trim();
  const statusF = (searchParams.status ?? "") as "new" | "in_progress" | "done" | "";
  const method  = (searchParams.method ?? "") as "ship" | "dropoff" | "";
  const from    = (searchParams.from ?? "").trim();
  const to      = (searchParams.to ?? "").trim();

  // kolom-filters
  const fOrder  = (searchParams.order_code ?? "").trim();
  const fModel  = (searchParams.model ?? "").trim();
  const fEmail  = (searchParams.email ?? "").trim();
  const fCity   = (searchParams.city ?? "").trim();

  // sortering
  const sort    = (searchParams.sort ?? "created_at");
  const dir     = (searchParams.dir  ?? "desc") as "asc" | "desc";

  // paginatie
  const page  = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;

  // query
  let query = supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id","order_code","created_at",
        "model","capacity_gb",
        "base_price_cents","final_price_cents","final_price_with_voucher_cents","voucher_bonus_cents","wants_voucher",
        "first_name","last_name","email","phone",
        "delivery_method","shop_location","street","house_number","postal_code","city","country",
        "iban",
        "status","admin_note","updated_at",
        "answers"
      ].join(","),
      { count: "exact" }
    );

  // algemene zoekterm
  if (q) {
    query = query.or([
      `order_code.ilike.%${q}%`,
      `model.ilike.%${q}%`,
      `first_name.ilike.%${q}%`,
      `last_name.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `city.ilike.%${q}%`,
      `shop_location.ilike.%${q}%`
    ].join(","));
  }

  // individuele filters
  if (fOrder) query = query.ilike("order_code", `%${fOrder}%`);
  if (fModel) query = query.ilike("model", `%${fModel}%`);
  if (fEmail) query = query.ilike("email", `%${fEmail}%`);
  if (fCity)  query = query.ilike("city", `%${fCity}%`);

  if (statusF) query = query.eq("status", statusF);
  if (method)  query = query.eq("delivery_method", method);
  if (from)    query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to)      query = query.lte("created_at", `${to}T23:59:59.999Z`);

  // sort
  const sortable = new Set([
    "order_code","created_at","model","capacity_gb","final_price_cents","status","email","city"
  ]);
  const sortCol = sortable.has(sort) ? sort : "created_at";
  query = query.order(sortCol as any, { ascending: dir === "asc" });

  // paginatie
  query = query.range(offset, offset + limit - 1);

  // fetch
  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;
  try {
    const res = await query as unknown as { data: Lead[] | null; error: any; count: number | null };
    data = res.data; error = res.error; count = res.count;
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads (Excel view)</h1>
        <div className="bb-card p-4 bg-red-50 border-red-200">
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
  const makeSortHref = (col: string) => {
    const sp = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(JSON.stringify(searchParams) as any)), sort: col, dir: (sort === col && dir === 'asc') ? 'desc' : 'asc' } as any);
    return `?${sp.toString()}`;
  };

  // helpers voor filters-submit
  const serialize = (name: string, value: string) => {
    const sp = new URLSearchParams();
    const entries = Object.entries({
      q, status: statusF, method, from, to, order_code: fOrder, model: fModel, email: fEmail, city: fCity, sort, dir, limit: String(limit)
    });
    for (const [k,v] of entries) if (v) sp.set(k, v);
    if (value) sp.set(name, value); else sp.delete(name);
    // Reset naar pagina 1 als je filtert
    sp.set('page','1');
    return `?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads (Excel view)</h1>
        <div className="flex gap-2">
          <Link href={`/admin/leads/export?download=1`} className="bb-btn">⬇︎ Export CSV</Link>
          <Link href="/admin" className="bb-btn">← Terug</Link>
        </div>
      </div>

      {/* globale zoek + quick filters */}
      <form className="flex flex-wrap items-center gap-3">
        <input name="q" defaultValue={q} placeholder="Zoek overal…" className="bb-input w-[280px]" />
        <select name="status" defaultValue={statusF} className="bb-select">
          <option value="">Alle status</option>
          <option value="new">Nieuw</option>
          <option value="in_progress">In behandeling</option>
          <option value="done">Afgehandeld</option>
        </select>
        <select name="method" defaultValue={method} className="bb-select">
          <option value="">Alle leveringen</option>
          <option value="ship">Verzenden</option>
          <option value="dropoff">Binnenbrengen</option>
        </select>
        <input type="date" name="from" defaultValue={from} className="bb-input" />
        <input type="date" name="to"   defaultValue={to}   className="bb-input" />
        <select name="limit" defaultValue={String(limit)} className="bb-select">
          <option value="25">25 / p</option>
          <option value="50">50 / p</option>
          <option value="100">100 / p</option>
        </select>
        <button className="bb-btn" type="submit">Filteren</button>
        <Link href="/admin/leads" className="bb-btn">Reset</Link>
      </form>

      {/* TABEL */}
      <div className="overflow-auto bb-card">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 w-[140px]">
                <a href={makeSortHref('order_code')} className="font-semibold hover:underline">Order</a>
                <div className="mt-1">
                  <input
                    defaultValue={fOrder}
                    placeholder="Filter…"
                    className="bb-input"
                    onChange={(e) => { (window as any).location = serialize('order_code', e.currentTarget.value); }}
                  />
                </div>
              </th>
              <th className="px-3 py-2 w-[160px]">
                <a href={makeSortHref('created_at')} className="font-semibold hover:underline">Datum</a>
              </th>
              <th className="px-3 py-2 w-[240px]">
                <a href={makeSortHref('model')} className="font-semibold hover:underline">Model</a>
                <div className="mt-1">
                  <input
                    defaultValue={fModel}
                    placeholder="Filter…"
                    className="bb-input"
                    onChange={(e) => { (window as any).location = serialize('model', e.currentTarget.value); }}
                  />
                </div>
              </th>
              <th className="px-3 py-2 w-[80px]">
                <a href={makeSortHref('capacity_gb')} className="font-semibold hover:underline">GB</a>
              </th>
              <th className="px-3 py-2 w-[140px]">
                <a href={makeSortHref('final_price_cents')} className="font-semibold hover:underline">Prijs (EUR)</a>
              </th>
              <th className="px-3 py-2 w-[160px]">
                <a className="font-semibold">Status</a>
              </th>
              <th className="px-3 py-2 w-[220px]">
                <a href={makeSortHref('email')} className="font-semibold hover:underline">Email</a>
                <div className="mt-1">
                  <input
                    defaultValue={fEmail}
                    placeholder="Filter…"
                    className="bb-input"
                    onChange={(e) => { (window as any).location = serialize('email', e.currentTarget.value); }}
                  />
                </div>
              </th>
              <th className="px-3 py-2 w-[160px]">
                <a href={makeSortHref('city')} className="font-semibold hover:underline">Stad</a>
                <div className="mt-1">
                  <input
                    defaultValue={fCity}
                    placeholder="Filter…"
                    className="bb-input"
                    onChange={(e) => { (window as any).location = serialize('city', e.currentTarget.value); }}
                  />
                </div>
              </th>
              <th className="px-3 py-2">Acties</th>
            </tr>
          </thead>

          <tbody>
            {(data ?? []).map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{lead.order_code}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{lead.model ?? "—"}</div>
                </td>
                <td className="px-3 py-2">{lead.capacity_gb ?? "—"}</td>

                {/* Inline prijs */}
                <td className="px-3 py-2">
                  <form action={updateLeadInlineAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <input
                      name="final_price_eur"
                      defaultValue={((lead.final_price_cents ?? 0)/100).toString()}
                      className="bb-input w-28"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                    <button className="bb-btn" type="submit">💾</button>
                  </form>
                </td>

                {/* Inline status */}
                <td className="px-3 py-2">
                  <form action={updateLeadInlineAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={lead.id} />
                    <select name="status" defaultValue={lead.status ?? 'new'} className="bb-select">
                      <option value="new">Nieuw</option>
                      <option value="in_progress">In behandeling</option>
                      <option value="done">Afgehandeld</option>
                    </select>
                    <button className="bb-btn" type="submit">💾</button>
                  </form>
                </td>

                <td className="px-3 py-2">{lead.email ?? "—"}</td>
                <td className="px-3 py-2">{lead.city ?? "—"}</td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {badge(lead.status)}
                    <form action={deleteLeadAction}>
                      <input type="hidden" name="id" value={lead.id} />
                      <button className="bb-btn danger" type="submit" title="Verwijderen">🗑️</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}

            {(!data || data.length === 0) && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Geen resultaten</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      <div className="flex items-center justify-center gap-2">
        {page > 1 ? (
          <Link className="bb-btn" href={buildPageHref(page-1, { q, statusF, method, from, to, fOrder, fModel, fEmail, fCity, sort, dir, limit })}>← Vorige</Link>
        ) : <span className="bb-btn" aria-disabled>← Vorige</span>}
        <span className="text-sm text-gray-600">Pagina {page} / {totalPages} &nbsp;•&nbsp; Totaal {total}</span>
        {page < totalPages ? (
          <Link className="bb-btn" href={buildPageHref(page+1, { q, statusF, method, from, to, fOrder, fModel, fEmail, fCity, sort, dir, limit })}>Volgende →</Link>
        ) : <span className="bb-btn" aria-disabled>Volgende →</span>}
      </div>
    </div>
  );
}

function buildPageHref(p: number, args: any) {
  const sp = new URLSearchParams();
  const map: Record<string,string> = {
    q: args.q, status: args.statusF, method: args.method, from: args.from, to: args.to,
    order_code: args.fOrder, model: args.fModel, email: args.fEmail, city: args.fCity,
    sort: args.sort, dir: args.dir, limit: String(args.limit), page: String(p)
  };
  Object.entries(map).forEach(([k, v]) => { if (v) sp.set(k, v); });
  return `?${sp.toString()}`;
}
