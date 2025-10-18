import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { updateStatusAction, saveNoteAction, deleteLeadAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  created_at: string;

  // toestel
  model: string | null;
  capacity_gb: number | null;

  // prijzen
  base_price_cents: number | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;
  voucher_bonus_cents: number | null;
  wants_voucher: boolean | null;

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
  status: "new" | "in_progress" | "done" | null;
  admin_note: string | null;
  updated_at: string | null;

  // antwoorden
  answers: any;
};

function eur(cents: number | null | undefined) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}
function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nl-BE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}
function maskIban(iban: string | null) {
  if (!iban) return "—";
  const clean = iban.replace(/\s+/g, "");
  if (clean.length <= 6) return clean;
  return clean.slice(0, 4) + "••••••••••••" + clean.slice(-4);
}

type SearchParams = {
  q?: string;
  method?: 'ship' | 'dropoff' | '';
  voucher?: 'yes' | 'no' | '';
  status?: 'new' | 'in_progress' | 'done' | '';
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const q       = (searchParams.q ?? '').trim();
  const method  = (searchParams.method  ?? '') as 'ship' | 'dropoff' | '';
  const voucher = (searchParams.voucher ?? '') as 'yes'  | 'no'      | '';
  const statusF = (searchParams.status  ?? '') as 'new'  | 'in_progress' | 'done' | '';
  const from    = (searchParams.from ?? '').trim();
  const to      = (searchParams.to ?? '').trim();
  const page    = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const limit   = Math.min(100, Math.max(10, parseInt(searchParams.limit ?? '24', 10) || 24));
  const offset  = (page - 1) * limit;

  let query = supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id","created_at",
        "model","capacity_gb",
        "base_price_cents","final_price_cents","final_price_with_voucher_cents","voucher_bonus_cents","wants_voucher",
        "first_name","last_name","email","phone",
        "delivery_method","shop_location",
        "street","house_number","postal_code","city","country",
        "iban",
        "status","admin_note","updated_at",
        "answers"
      ].join(","),
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or([
      `model.ilike.%${q}%`,
      `first_name.ilike.%${q}%`,
      `last_name.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `city.ilike.%${q}%`,
      `shop_location.ilike.%${q}%`
    ].join(','));
  }
  if (method === 'ship')    query = query.eq('delivery_method', 'ship');
  if (method === 'dropoff') query = query.eq('delivery_method', 'dropoff');

  if (voucher === 'yes') query = query.eq('wants_voucher', true);
  if (voucher === 'no')  query = query.or('wants_voucher.is.null,wants_voucher.eq.false');

  if (statusF) query = query.eq('status', statusF);

  if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
  if (to)   query = query.lte('created_at', `${to}T23:59:59.999Z`);

  query = query.range(offset, offset + limit - 1);

  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;

  try {
    const res = await query as unknown as { data: Lead[] | null; error: any; count: number | null };
    data = res.data; error = res.error; count = res.count;
  } catch (e: any) {
    error = e;
  }

  // ----------- FOUTKAART -----------
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-3">Leads</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <div className="font-medium text-red-700">Fout bij laden</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {error?.message || JSON.stringify(error)}
          </pre>
        </div>
      </div>
    );
  }

  // ----------- UI -----------
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <div className="flex items-center gap-2">
          <Link href={`/admin/leads/export?${new URLSearchParams({
            q, method, voucher, status: statusF, from, to
          }).toString()}&download=1`} className="bb-btn border bg-white hover:bg-gray-50">
            ⬇︎ Export CSV
          </Link>
          <Link href="/admin" className="bb-btn">← Terug</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bb-card p-4">
        <form className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input name="q" defaultValue={q} placeholder="Zoeken…" className="md:col-span-2 border rounded px-3 py-2" />
          <select name="method" defaultValue={method} className="border rounded px-3 py-2">
            <option value="">Alle leveringen</option>
            <option value="ship">Verzenden</option>
            <option value="dropoff">Binnenbrengen</option>
          </select>
          <select name="voucher" defaultValue={voucher} className="border rounded px-3 py-2">
            <option value="">Alle</option>
            <option value="yes">Met voucher</option>
            <option value="no">Zonder voucher</option>
          </select>
          <select name="status" defaultValue={statusF} className="border rounded px-3 py-2">
            <option value="">Alle status</option>
            <option value="new">Nieuw</option>
            <option value="in_progress">In behandeling</option>
            <option value="done">Afgehandeld</option>
          </select>
          <input type="date" name="from" defaultValue={from} className="border rounded px-3 py-2" />
          <input type="date" name="to"   defaultValue={to}   className="border rounded px-3 py-2" />
          <div className="flex gap-2 md:col-span-7">
            <select name="limit" defaultValue={String(limit)} className="border rounded px-3 py-2">
              <option value="12">12 / p</option>
              <option value="24">24 / p</option>
              <option value="48">48 / p</option>
              <option value="96">96 / p</option>
            </select>
            <button className="bb-btn border bg-green-600 text-white border-green-600" type="submit">Filteren</button>
            <Link href="/admin/leads" className="bb-btn border">Reset</Link>
          </div>
        </form>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bb-card p-4"><div className="text-xs text-gray-500">Totaal</div><div className="text-xl font-semibold">{(count ?? 0).toLocaleString('nl-BE')}</div></div>
        <div className="bb-card p-4"><div className="text-xs text-gray-500">Pagina</div><div className="text-xl font-semibold">{page} / {Math.max(1, Math.ceil((count ?? 0)/limit))}</div></div>
        <div className="bb-card p-4"><div className="text-xs text-gray-500">Per pagina</div><div className="text-xl font-semibold">{limit}</div></div>
        <div className="bb-card p-4"><div className="text-xs text-gray-500">Status</div><div className="text-sm">{statusF || 'alle'}</div></div>
        <div className="bb-card p-4"><div className="text-xs text-gray-500">Filter</div><div className="text-sm">{q || '—'}</div></div>
      </div>

      {/* Grid */}
      {!data?.length ? (
        <div className="bb-card p-6 text-gray-600">Geen resultaten voor deze filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {data.map((lead: Lead) => (
            <article key={lead.id} className="bb-card p-4 hover:shadow-lg transition-shadow">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">{fmtDate(lead.created_at)}</div>
                  <div className="font-semibold">
                    {lead.model ?? "—"} {lead.capacity_gb ? `• ${lead.capacity_gb} GB` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {eur(lead.final_price_with_voucher_cents ?? lead.final_price_cents)}
                  </div>
                  {lead.wants_voucher && lead.voucher_bonus_cents ? (
                    <div className="text-[11px] text-green-700">+ voucher {eur(lead.voucher_bonus_cents)}</div>
                  ) : null}
                  <StatusBadge status={lead.status ?? 'new'} />
                </div>
              </header>

              <hr className="my-3"/>

              <section className="space-y-2 text-sm">
                <div><span className="text-gray-500">Klant: </span>{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}</div>
                <div><span className="text-gray-500">Contact: </span>{lead.email || lead.phone || '—'}</div>
                <div><span className="text-gray-500">IBAN: </span><span className="font-mono">{maskIban(lead.iban)}</span></div>
                <div><span className="text-gray-500">Levering: </span>
                  {lead.delivery_method === 'ship'
                    ? `Verzenden — ${[lead.street, lead.house_number, lead.postal_code, lead.city, lead.country].filter(Boolean).join(' ')}`
                    : lead.delivery_method === 'dropoff'
                    ? `Binnenbrengen — ${lead.shop_location ?? '—'}`
                    : '—'}
                </div>
              </section>

              {/* Notitie + status acties */}
              <div className="mt-3 space-y-2">
                <form action={saveNoteAction} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={lead.id}/>
                  <label className="text-xs text-gray-500">Notities (intern)</label>
                  <textarea
                    name="admin_note"
                    defaultValue={lead.admin_note ?? ''}
                    className="border rounded px-3 py-2 text-sm min-h-[80px]"
                    placeholder="Bv. klant gecontacteerd op …"
                  />
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Laatst: {fmtDate(lead.updated_at)}</span>
                    <div className="flex gap-2">
                      <form action={updateStatusAction}>
                        <input type="hidden" name="id" value={lead.id}/>
                        <input type="hidden" name="status" value="new"/>
                        <button className="bb-btn border" type="submit">Nieuw</button>
                      </form>
                      <form action={updateStatusAction}>
                        <input type="hidden" name="id" value={lead.id}/>
                        <input type="hidden" name="status" value="in_progress"/>
                        <button className="bb-btn border" type="submit">In behandeling</button>
                      </form>
                      <form action={updateStatusAction}>
                        <input type="hidden" name="id" value={lead.id}/>
                        <input type="hidden" name="status" value="done"/>
                        <button className="bb-btn border bg-green-600 text-white border-green-600" type="submit">Afgehandeld</button>
                      </form>
                      <button className="bb-btn border" formAction={saveNoteAction} type="submit">Note opslaan</button>
                      <form action={deleteLeadAction} onSubmit={(e) => { if (!confirm('Deze lead definitief verwijderen?')) e.preventDefault(); }}>
                        <input type="hidden" name="id" value={lead.id}/>
                        <button className="bb-btn border" type="submit" title="Verwijderen">🗑️</button>
                      </form>
                    </div>
                  </div>
                </form>
              </div>

              {/* Antwoorden */}
              <details className="mt-3 group">
                <summary className="cursor-pointer select-none text-sm text-gray-700 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-300 group-open:bg-gray-500"></span>
                  Antwoorden (multipliers)
                </summary>
                <div className="mt-2 text-xs bg-gray-50 rounded p-2 border">
                  {lead.answers ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(lead.answers, null, 2)}
                    </pre>
                  ) : '—'}
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
      <Pagination total={(count ?? 0)} page={page} limit={limit} params={{ q, method, voucher, status: statusF, from, to }} />
    </div>
  );
}

/* ===== UI helpers ===== */

function StatusBadge({ status }: { status: 'new' | 'in_progress' | 'done' | string }) {
  const cls =
    status === 'done'
      ? 'bg-green-100 text-green-800 border-green-200'
      : status === 'in_progress'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-gray-100 text-gray-800 border-gray-200';
  const label =
    status === 'done' ? 'Afgehandeld' :
    status === 'in_progress' ? 'In behandeling' : 'Nieuw';
  return <span className={`inline-block mt-2 px-2 py-1 text-[11px] rounded border ${cls}`}>{label}</span>;
}

function Pagination({ total, page, limit, params }: { total: number; page: number; limit: number; params: Record<string,string> }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
    sp.set('page', String(p));
    sp.set('limit', String(limit));
    return `?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-center gap-2">
      <Link aria-disabled={page<=1} className="bb-btn border" href={qs(prev)}>← Vorige</Link>
      <span className="text-sm text-gray-600">Pagina {page} / {totalPages}</span>
      <Link aria-disabled={page>=totalPages} className="bb-btn border" href={qs(next)}>Volgende →</Link>
    </div>
  );
}
