// app/admin/leads/analytics/page.tsx
// Moderne admin-only analyse voor afgewerkte leads

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Lead = {
  id: string;
  created_at: string | null;
  status: string | null;
  shop_location: string | null;
  model: string | null;
  capacity_gb: number | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;
  wants_voucher: boolean | null;
};

function eur(cents: number) {
  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

function monthKey(date: string | null) {
  if (!date) return "Onbekend";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "Onbekend";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function leadValueCents(lead: Lead) {
  if (lead.wants_voucher && typeof lead.final_price_with_voucher_cents === "number") {
    return lead.final_price_with_voucher_cents;
  }
  return typeof lead.final_price_cents === "number" ? lead.final_price_cents : 0;
}

function inc(map: Map<string, number>, key: string | null | undefined, amount = 1) {
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + amount);
}

function topEntries(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${tone} opacity-10`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone} text-xl text-white`}>
          {icon}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {sub && <div className="text-xs text-slate-500">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function BarValue({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{eur(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function BarCount({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function DonutChart({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  let cursor = 0;

  const colors = [
    "#2563eb",
    "#16a34a",
    "#f97316",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#475569",
  ];

  const gradient =
    total > 0
      ? rows
          .map(([, value], i) => {
            const start = cursor;
            const end = cursor + (value / total) * 100;
            cursor = end;
            return `${colors[i % colors.length]} ${start}% ${end}%`;
          })
          .join(", ")
      : "#e2e8f0 0% 100%";

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-700">
        {title}
      </h2>

      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div
          className="relative h-40 w-40 shrink-0 rounded-full shadow-inner"
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white shadow-sm">
            <div className="text-xl font-bold">{total}</div>
            <div className="text-[10px] uppercase text-slate-500">totaal</div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {rows.map(([label, value], i) => (
            <div key={label} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="truncate">{label}</span>
              </span>
              <span className="font-semibold">
                {value} • {total ? Math.round((value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function getDoneLeads(): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id",
        "created_at",
        "status",
        "shop_location",
        "model",
        "capacity_gb",
        "final_price_cents",
        "final_price_with_voucher_cents",
        "wants_voucher",
      ].join(",")
    )
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[LEADS ANALYTICS] fetch error", error);
    return [];
  }

  return (data || []) as unknown as Lead[];
}

export default async function LeadsAnalyticsPage() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) redirect("/admin/login?reason=not_logged_in");

  if ((adminUser as any).role !== "admin") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Alleen admins mogen deze analyse bekijken.
        </div>
      </div>
    );
  }

  const leads = await getDoneLeads();

  const totalDone = leads.length;
  const totalValue = leads.reduce((sum, lead) => sum + leadValueCents(lead), 0);
  const avgValue = totalDone > 0 ? Math.round(totalValue / totalDone) : 0;

  const byMonthCount = new Map<string, number>();
  const byMonthValue = new Map<string, number>();
  const byShopCount = new Map<string, number>();
  const byShopValue = new Map<string, number>();
  const byModelCount = new Map<string, number>();
  const byModelValue = new Map<string, number>();

  for (const lead of leads) {
    const value = leadValueCents(lead);
    const month = monthKey(lead.created_at);
    const model = [lead.model || "Onbekend", lead.capacity_gb ? `${lead.capacity_gb}GB` : null]
      .filter(Boolean)
      .join(" ");

    inc(byMonthCount, month);
    inc(byMonthValue, month, value);
    inc(byShopCount, lead.shop_location);
    inc(byShopValue, lead.shop_location, value);
    inc(byModelCount, model);
    inc(byModelValue, model, value);
  }

  const monthCountRows = Array.from(byMonthCount.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const monthValueRows = Array.from(byMonthValue.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const maxMonthCount = Math.max(1, ...monthCountRows.map((x) => x[1]));
  const maxMonthValue = Math.max(1, ...monthValueRows.map((x) => x[1]));
  const shopValueRows = topEntries(byShopValue, 20);
  const modelValueRows = topEntries(byModelValue, 20);

  const maxShopValue = Math.max(1, ...shopValueRows.map((x) => x[1]));
  const maxModelValue = Math.max(1, ...modelValueRows.map((x) => x[1]));

  return (
    <div className="min-h-screen bg-slate-50 p-4 space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-blue-100">📊 Admin analytics</div>
            <h1 className="mt-1 text-2xl font-bold">Afgewerkte leads analyse</h1>
            <p className="mt-1 text-sm text-blue-100">
              Waarde, volumes, winkels en modellen voor alle leads met status done.
            </p>
          </div>

          <Link
            href="/admin/leads"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
          >
            ← Terug naar leads
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon="✅" label="Afgewerkte leads" value={totalDone} sub="Status: done" tone="bg-emerald-600" />
        <StatCard icon="💶" label="Totale waarde" value={eur(totalValue)} sub="Som van alle afgewerkte leads" tone="bg-blue-600" />
        <StatCard icon="📈" label="Gemiddelde waarde" value={eur(avgValue)} sub="Gemiddeld per lead" tone="bg-indigo-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            📅 Leads per maand
          </h2>
          {monthCountRows.map(([label, value]) => (
            <BarCount key={label} label={label} value={value} max={maxMonthCount} />
          ))}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            💰 Waarde per maand
          </h2>
          {monthValueRows.map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxMonthValue} />
          ))}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            🏬 Waarde per winkel
          </h2>
          {shopValueRows.map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxShopValue} />
          ))}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            📱 Waarde per model
          </h2>
          {modelValueRows.map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxModelValue} />
          ))}
        </section>

        <DonutChart title="📱 Verhouding per toestel/model" rows={topEntries(byModelCount, 8)} />
        <DonutChart title="🏬 Verhouding per winkel" rows={topEntries(byShopCount, 8)} />
      </div>
    </div>
  );
}

