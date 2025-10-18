import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
import { updateStatusAction, saveNoteAction, deleteLeadAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
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
  method?: "ship" | "dropoff" | "";
  voucher?: "yes" | "no" | "";
  status?: "new" | "in_progress" | "done" | "";
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const q       = (searchParams.q ?? "").trim();
  const method  = (searchParams.method  ?? "") as "ship" | "dropoff" | "";
  const voucher = (searchParams.voucher ?? "") as "yes"  | "no"      | "";
  const statusF = (searchParams.status  ?? "") as "new"  | "in_progress" | "done" | "";
  const from    = (searchParams.from ?? "").trim();
  const to      = (searchParams.to ?? "").trim();
  const page    = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit   = Math.min(100, Math.max(12, parseInt(searchParams.limit ?? "24", 10) || 24));
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
    ].join(","));
  }
  if (method === "ship")    query = query.eq("delivery_method", "ship");
  if (method === "dropoff") query = query.eq("delivery_method", "dropoff");

  if (voucher === "yes") query = query.eq("wants_voucher", true);
  if (voucher === "no")  query = query.or("wants_voucher.is.null,wants_voucher.eq.false");

  if (statusF) query = query.eq("status", statusF);

  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to)   query = query.lte("created_at", `${to}T23:59:59.999Z`);

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

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Header count={count ?? 0} />
        <div className="bb-card p-5 border-red-200 bg-red-50">
          <div className="text-red-700 font-medium">Fout bij laden</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {error?.message || JSON.stringify(error)}
          </pre>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / limit));

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <Header count={count ?? 0} />

      {/* Sticky filters */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/95 border rounded-xl bb-shadow p-4">
        <Filters initial={{ q, method, voucher, status: statusF, from, to, limit }} />
      </div>

      {/* Stats row */}
      <StatsRow total={count ?? 0} page={page} perPage={limit} status={statusF || "alle"} query={q} />

      {/* Grid */}
      {!data?.length ? (
        <div className="bb-card p-8 text-gray-600 text-center">Geen resultaten voor deze filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-5">
          {data.map((lead: Lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      <Pagination
        total={count ?? 0}
        page={page}
        limit={limit}
        params={{ q, method, voucher, status: statusF, from, to }}
        totalPages={totalPages}
      />
    </div>
  );
}

/* === Presentatiecomponenten === */

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-gray-500 mt-1">Beheer je buyback-aanvragen</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/leads/export?download=1`}
          className="bb-btn subtle"
        >
          ⬇︎ Export CSV
        </Link>
        <span className="bb-badge">{count} totaal</span>
      </div>
    </div>
  );
}

function Filters({
  initial
}: {
  initial: {
    q: string;
    method: "ship" | "dropoff" | "";
    voucher: "yes" | "no" | "";
    status: "new" | "in_progress" | "done" | "";
    from: string;
    to: string;
    limit: number | string;
  };
}) {
  const { q, method, voucher, status, from, to, limit } = initial;
  return (
    <form className="grid grid-cols-1 md:grid-cols-12 gap-3">
      <input name="q" defaultValue={q} placeholder="Zoeken: model, klant, e-mail, stad…"
             className="bb-input md:col-span-4" />
      <select name="method" defaultValue={method} className="bb-select md:col-span-2">
        <option value="">Alle leveringen</option>
        <option value="ship">Verzenden</option>
        <option value="dropoff">Binnenbrengen</option>
      </select>
      <select name="voucher" defaultValue={voucher} className="bb-select md:col-span-2">
        <option value="">Voucher: alle</option>
        <option value="yes">Met voucher</option>
        <option value="no">Zonder voucher</option>
      </select>
      <select name="status" defaultValue={status} className="bb-select md:col-span-2">
        <option value="">Status: alle</option>
        <option value="new">Nieuw</option>
        <option value="in_progress">In behandeling</option>
        <option value="done">Afgehandeld</option>
      </select>
      <div className="flex gap-3 md:col-span-6">
        <input type="date" name="from" defaultValue={from} className="bb-input"/>
        <input type="date" name="to"   defaultValue={to}   className="bb-input"/>
      </div>
      <div className="flex gap-3 md:col-span-6 justify-end">
        <select name="limit" defaultValue={String(limit)} className="bb-select w-28">
          <option value="12">12 / p</option>
          <option value="24">24 / p</option>
          <option value="48">48 / p</option>
          <option value="96">96 / p</option>
        </select>
        <button className="bb-btn primary" type="submit">Filteren</button>
        <Link href="/admin/leads" className="bb-btn subtle">Reset</Link>
      </div>
    </form>
  );
}

function StatsRow({ total, page, perPage, status, query }: { total: number; page: number; perPage: number; status: string; query: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="bb-card p-4"><div className="text-xs text-gray-500">Totaal</div><div className="text-2xl font-semibold">{total.toLocaleString("nl-BE")}</div></div>
      <div className="bb-card p-4"><div className="text-xs text-gray-500">Pagina</div><div className="text-2xl font-semibold">{page}</div></div>
      <div className="bb-card p-4"><div className="text-xs text-gray-500">Per pagina</div><div className="text-2xl font-semibold">{perPage}</div></div>
      <div className="bb-card p-4"><div className="text-xs text-gray-500">Status</div><div className="text-sm">{status}</div></div>
      <div className="bb-card p-4"><div className="text-xs text-gray-500">Zoekterm</div><div className="text-sm truncate" title={query || "—"}>{query || "—"}</div></div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const price = eur(lead.final_price_with_voucher_cents ?? lead.final_price_cents);
  return (
    <article className="bb-card p-5 group">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500">{fmtDate(lead.created_at)}</div>
          <h2 className="font-semibold tracking-tight mt-0.5">
            {lead.model ?? "—"} {lead.capacity_gb ? <span className="text-gray-500">• {lead.capacity_gb} GB</span> : null}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{price}</div>
          {lead.wants_voucher && lead.voucher_bonus_cents ? (
            <div className="text-[11px] text-emerald-700">+ voucher {eur(lead.voucher_bonus_cents)}</div>
          ) : null}
          <StatusBadge status={lead.status ?? "new"} />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="bb-dot" /> <span className="text-gray-500 w-24">Klant</span>
          <span className="truncate">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bb-dot" /> <span className="text-gray-500 w-24">Contact</span>
          <span className="truncate">{lead.email || lead.phone || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bb-dot" /> <span className="text-gray-500 w-24">IBAN</span>
          <span className="font-mono">{maskIban(lead.iban)}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="bb-dot" /> <span className="text-gray-500 w-24">Levering</span>
          <span className="truncate">
            {lead.delivery_method === "ship"
              ? `Verzenden — ${[lead.street, lead.house_number, lead.postal_code, lead.city, lead.country].filter(Boolean).join(" ")}`
              : lead.delivery_method === "dropoff"
              ? `Binnenbrengen — ${lead.shop_location ?? "—"}`
              : "—"}
          </span>
        </div>
      </div>

      {/* Acties */}
      <section className="mt-5 space-y-3">
        <form action={saveNoteAction} className="space-y-2">
          <input type="hidden" name="id" value={lead.id} />
          <label className="text-xs text-gray-500">Notities (intern)</label>
          <textarea name="admin_note" defaultValue={lead.admin_note ?? ""} className="bb-textarea" placeholder="Bv. klant gecontacteerd op …" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Laatst: {fmtDate(lead.updated_at)}</span>
            <div className="flex flex-wrap gap-2">
              <form action={updateStatusAction}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value="new" />
                <button className="bb-btn subtle" type="submit">Nieuw</button>
              </form>
              <form action={updateStatusAction}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value="in_progress" />
                <button className="bb-btn subtle" type="submit">In behandeling</button>
              </form>
              <form action={updateStatusAction}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value="done" />
                <button className="bb-btn success" type="submit">Afgehandeld</button>
              </form>
              <button className="bb-btn" formAction={saveNoteAction} type="submit">Note opslaan</button>
              <form action={deleteLeadAction}>
                <input type="hidden" name="id" value={lead.id} />
                <button className="bb-btn danger" type="submit" title="Verwijderen">Verwijderen</button>
              </form>
            </div>
          </div>
        </form>
      </section>

      {/* Antwoorden */}
      <details className="mt-3 group">
        <summary className="cursor-pointer select-none text-sm text-gray-700 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 group-open:bg-gray-500"></span>
          Antwoorden (multipliers)
        </summary>
        <div className="mt-2 text-xs bg-gray-50 rounded p-3 border">
          {lead.answers ? (
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(lead.answers, null, 2)}</pre>
          ) : "—"}
        </div>
      </details>
    </article>
  );
}

function StatusBadge({ status }: { status: "new" | "in_progress" | "done" | string }) {
  const label =
    status === "done" ? "Afgehandeld" :
    status === "in_progress" ? "In behandeling" : "Nieuw";

  const cls =
    status === "done" ? "bb-badge success" :
    status === "in_progress" ? "bb-badge warn" : "bb-badge";

  return <span className={cls}>{label}</span>;
}

function Pagination({
  total, page, limit, params, totalPages
}: { total: number; page: number; limit: number; totalPages: number; params: Record<string, string> }) {
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
    sp.set("page", String(p));
    sp.set("limit", String(limit));
    return `?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-center gap-2">
      <Link aria-disabled={page<=1} className="bb-btn subtle" href={qs(prev)}>← Vorige</Link>
      <span className="text-sm text-gray-600">Pagina {page} / {totalPages}</span>
      <Link aria-disabled={page>=totalPages} className="bb-btn subtle" href={qs(next)}>Volgende →</Link>
    </div>
  );
}
