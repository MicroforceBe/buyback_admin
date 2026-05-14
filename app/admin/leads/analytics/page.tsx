// app/admin/leads/analytics/page.tsx
// Moderne admin-only analyse voor leads

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
  cancel_reason: string | null;
};

function eur(cents: number) {
  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function monthKey(date: string | null) {
  if (!date) return "Onbekend";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "Onbekend";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function leadValueCents(lead: Lead) {
  if (
    lead.wants_voucher &&
    typeof lead.final_price_with_voucher_cents === "number"
  ) {
    return lead.final_price_with_voucher_cents;
  }

  return typeof lead.final_price_cents === "number"
    ? lead.final_price_cents
    : 0;
}

function modelLabel(lead: Lead) {
  return [
    lead.model || "Onbekend",
    lead.capacity_gb ? `${lead.capacity_gb}GB` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function categoryLabel(model: string | null) {
  const m = (model || "").toLowerCase();

  if (m.includes("iphone")) return "iPhone";
  if (m.includes("ipad")) return "iPad";
  if (m.includes("macbook")) return "MacBook";
  if (m.includes("imac")) return "iMac";
  if (m.includes("watch")) return "Apple Watch";
  if (m.includes("airpods")) return "AirPods";
  if (m.includes("samsung")) return "Samsung";
  if (m.includes("playstation")) return "PlayStation";
  if (m.includes("switch")) return "Nintendo Switch";

  return "Andere";
}

function inc(
  map: Map<string, number>,
  key: string | null | undefined,
  amount = 1
) {
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + amount);
}

function topEntries(map: Map<string, number>, limit = 12) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
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
    <div className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_25px_60px_rgba(15,23,42,0.14)]">
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full ${tone} opacity-10`} />
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone} text-xl text-white shadow-lg`}>
          {icon}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="text-2xl font-black text-slate-950">{value}</div>
          {sub && <div className="text-xs text-slate-500">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function VerticalBarChart({
  title,
  icon,
  rows,
  type,
}: {
  title: string;
  icon: string;
  rows: [string, number][];
  type: "count" | "value";
}) {
  const max = Math.max(1, ...rows.map(([, v]) => v));

  return (
    <section className="rounded-3xl border border-white/60 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
          {icon} {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
          hover voor detail
        </span>
      </div>

      <div className="flex h-72 items-end gap-3 overflow-x-auto border-b border-slate-200 pb-3">
        {rows.map(([label, value]) => {
          const h = Math.max(8, Math.round((value / max) * 100));
          return (
            <div
              key={label}
              className="group flex min-w-[54px] flex-1 flex-col items-center justify-end gap-2"
              title={`${label}: ${type === "value" ? eur(value) : value}`}
            >
              <div className="text-[10px] font-bold text-slate-700 opacity-0 transition group-hover:opacity-100">
                {type === "value" ? eur(value) : value}
              </div>

              <div className="relative flex h-56 w-full items-end justify-center">
                <div
                  className={`w-9 rounded-t-2xl shadow-[8px_8px_18px_rgba(15,23,42,0.18)] transition group-hover:-translate-y-1 ${
                    type === "value"
                      ? "bg-gradient-to-t from-blue-700 via-blue-500 to-cyan-300"
                      : "bg-gradient-to-t from-emerald-700 via-emerald-500 to-lime-300"
                  }`}
                  style={{ height: `${h}%` }}
                />
              </div>

              <div className="max-w-[70px] -rotate-45 truncate text-[10px] font-semibold text-slate-500">
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HorizontalValueWithCount({
  title,
  icon,
  rowsValue,
  rowsCount,
}: {
  title: string;
  icon: string;
  rowsValue: [string, number][];
  rowsCount: Map<string, number>;
}) {
  const max = Math.max(1, ...rowsValue.map(([, v]) => v));

  return (
    <section className="rounded-3xl border border-white/60 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] space-y-3">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
        {icon} {title}
      </h2>

      {rowsValue.map(([label, value]) => {
        const count = rowsCount.get(label) || 0;
        const width = Math.max(3, Math.round((value / max) * 100));

        return (
          <div key={label} className="space-y-1.5" title={`${label}: ${eur(value)} • ${count} leads`}>
            <div className="flex justify-between gap-3 text-xs">
              <span className="truncate font-bold text-slate-700">{label}</span>
              <span className="font-black text-slate-950 whitespace-nowrap">
                {eur(value)} • {count}x
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-300 shadow-[0_6px_15px_rgba(37,99,235,0.35)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DonutChart({
  title,
  rows,
}: {
  title: string;
  rows: [string, number][];
}) {
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
    <section className="rounded-3xl border border-white/60 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-800">
        {title}
      </h2>

      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div
          className="relative h-44 w-44 shrink-0 rounded-full shadow-[12px_18px_30px_rgba(15,23,42,0.18)]"
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <div className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <div className="text-2xl font-black">{total}</div>
            <div className="text-[10px] uppercase text-slate-500">totaal</div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {rows.map(([label, value], i) => (
            <div key={label} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full shadow"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="truncate font-semibold">{label}</span>
              </span>
              <span className="font-black">
                {value} • {total ? Math.round((value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function getLeads(): Promise<Lead[]> {
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
        "cancel_reason",
      ].join(",")
    )
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

  const allLeads = await getLeads();

  const doneLeads = allLeads.filter((l) => l.status === "done");
  const cancelledLeads = allLeads.filter((l) => l.status === "cancelled");

  const totalDone = doneLeads.length;
  const totalCancelled = cancelledLeads.length;
  const totalClosed = totalDone + totalCancelled;

  const totalValue = doneLeads.reduce((sum, lead) => sum + leadValueCents(lead), 0);
  const avgValue = totalDone > 0 ? Math.round(totalValue / totalDone) : 0;

  const byMonthCount = new Map<string, number>();
  const byMonthValue = new Map<string, number>();
  const byShopCount = new Map<string, number>();
  const byShopValue = new Map<string, number>();
  const byModelCount = new Map<string, number>();
  const byModelValue = new Map<string, number>();
  const byCategoryCount = new Map<string, number>();
  const byCategoryValue = new Map<string, number>();
  const cancelReasons = new Map<string, number>();

  for (const lead of doneLeads) {
    const value = leadValueCents(lead);
    const month = monthKey(lead.created_at);
    const model = modelLabel(lead);
    const category = categoryLabel(lead.model);

    inc(byMonthCount, month);
    inc(byMonthValue, month, value);
    inc(byShopCount, lead.shop_location);
    inc(byShopValue, lead.shop_location, value);
    inc(byModelCount, model);
    inc(byModelValue, model, value);
    inc(byCategoryCount, category);
    inc(byCategoryValue, category, value);
  }

  for (const lead of cancelledLeads) {
    inc(cancelReasons, lead.cancel_reason || "Geen reden opgegeven");
  }

  const monthCountRows = Array.from(byMonthCount.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const monthValueRows = Array.from(byMonthValue.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 p-4 space-y-5">
      <div className="rounded-[2rem] bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 p-7 text-white shadow-[0_25px_70px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-100">📊 Admin analytics</div>
            <h1 className="mt-1 text-3xl font-black">Leads Performance Dashboard</h1>
            <p className="mt-2 text-sm text-blue-100">
              Focus op afgewerkte waarde, volumes, winkels, modellen, categorieën en annulaties.
            </p>
          </div>

          <Link
            href="/admin/leads"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
          >
            ← Terug naar leads
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon="✅" label="Afgewerkt" value={totalDone} sub={`${pct(totalDone, totalClosed)} van gesloten leads`} tone="bg-emerald-600" />
        <StatCard icon="❌" label="Geannuleerd" value={totalCancelled} sub={`${pct(totalCancelled, totalClosed)} van gesloten leads`} tone="bg-red-600" />
        <StatCard icon="💶" label="Totale waarde" value={eur(totalValue)} sub="Alle afgewerkte leads" tone="bg-blue-600" />
        <StatCard icon="📈" label="Gemiddelde waarde" value={eur(avgValue)} sub="Gemiddeld per afgewerkte lead" tone="bg-indigo-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VerticalBarChart title="Leads per maand" icon="📅" rows={monthCountRows} type="count" />
        <VerticalBarChart title="Waarde per maand" icon="💰" rows={monthValueRows} type="value" />

        <HorizontalValueWithCount
          title="Waarde per model"
          icon="📱"
          rowsValue={topEntries(byModelValue, 20)}
          rowsCount={byModelCount}
        />

        <HorizontalValueWithCount
          title="Waarde per winkel"
          icon="🏬"
          rowsValue={topEntries(byShopValue, 20)}
          rowsCount={byShopCount}
        />

        <HorizontalValueWithCount
          title="Waarde per categorie"
          icon="🗂️"
          rowsValue={topEntries(byCategoryValue, 20)}
          rowsCount={byCategoryCount}
        />

        <section className="rounded-3xl border border-white/60 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
            ❌ Redenen van annulering
          </h2>

          {topEntries(cancelReasons, 20).length === 0 ? (
            <p className="text-sm text-slate-500">Geen geannuleerde leads gevonden.</p>
          ) : (
            topEntries(cancelReasons, 20).map(([label, value]) => {
              const width = Math.max(
                3,
                Math.round((value / Math.max(1, totalCancelled)) * 100)
              );

              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="truncate font-bold text-slate-700">{label}</span>
                    <span className="font-black text-slate-950">
                      {value} • {pct(value, totalCancelled)}
                    </span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-orange-300 shadow-[0_6px_15px_rgba(220,38,38,0.35)]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </section>

        <DonutChart title="📱 Verhouding per toestel/model" rows={topEntries(byModelCount, 8)} />
        <DonutChart title="🗂️ Verhouding per categorie" rows={topEntries(byCategoryCount, 8)} />
        <DonutChart title="🏬 Verhouding per winkel" rows={topEntries(byShopCount, 8)} />
        <DonutChart
          title="✅ Afgewerkt vs ❌ geannuleerd"
          rows={[
            ["Afgewerkt", totalDone],
            ["Geannuleerd", totalCancelled],
          ]}
        />
      </div>
    </div>
  );
}
