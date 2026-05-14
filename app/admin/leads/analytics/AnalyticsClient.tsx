"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#475569",
];

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

function inc(map: Map<string, number>, key: string, amount = 1) {
  map.set(key || "Onbekend", (map.get(key || "Onbekend") || 0) + amount);
}

function toRows(map: Map<string, number>, keyName = "name") {
  return Array.from(map.entries())
    .map(([key, value]) => ({ [keyName]: key, value }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl text-white">
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

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-800">
        {title}
      </h2>
      <div className="h-80">{children}</div>
    </section>
  );
}

export default function AnalyticsClient({
  leads,
  from,
  to,
  preset,
}: {
  leads: Lead[];
  from: string;
  to: string;
  preset: string;
}) {
  const doneLeads = leads.filter((l) => l.status === "done");
  const cancelledLeads = leads.filter((l) => l.status === "cancelled");

  const totalDone = doneLeads.length;
  const totalCancelled = cancelledLeads.length;
  const totalValue = doneLeads.reduce((sum, l) => sum + leadValueCents(l), 0);
  const avgValue = totalDone > 0 ? Math.round(totalValue / totalDone) : 0;

  const byMonthCount = new Map<string, number>();
  const byMonthValue = new Map<string, number>();
  const byShopValue = new Map<string, number>();
  const byShopCount = new Map<string, number>();
  const byModelValue = new Map<string, number>();
  const byModelCount = new Map<string, number>();
  const byCategoryValue = new Map<string, number>();
  const byCategoryCount = new Map<string, number>();
  const cancelReasons = new Map<string, number>();

  for (const lead of doneLeads) {
    const value = leadValueCents(lead);
    const month = monthKey(lead.created_at);
    const model = modelLabel(lead);
    const category = categoryLabel(lead.model);
    const shop = lead.shop_location || "Onbekend";

    inc(byMonthCount, month);
    inc(byMonthValue, month, value);
    inc(byShopCount, shop);
    inc(byShopValue, shop, value);
    inc(byModelCount, model);
    inc(byModelValue, model, value);
    inc(byCategoryCount, category);
    inc(byCategoryValue, category, value);
  }

  for (const lead of cancelledLeads) {
    inc(cancelReasons, lead.cancel_reason || "Geen reden opgegeven");
  }

  const monthRows = Array.from(byMonthCount.entries())
    .map(([month, count]) => ({
      month,
      leads: count,
      value: byMonthValue.get(month) || 0,
      value_eur: Math.round((byMonthValue.get(month) || 0) / 100),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const modelRows = toRows(byModelValue).slice(0, 15).map((r) => ({
    ...r,
    count: byModelCount.get(String(r.name)) || 0,
    value_eur: Math.round(Number(r.value) / 100),
  }));

  const shopRows = toRows(byShopValue).slice(0, 12).map((r) => ({
    ...r,
    count: byShopCount.get(String(r.name)) || 0,
    value_eur: Math.round(Number(r.value) / 100),
  }));

  const categoryRows = toRows(byCategoryValue).map((r) => ({
    ...r,
    count: byCategoryCount.get(String(r.name)) || 0,
    value_eur: Math.round(Number(r.value) / 100),
  }));

  const cancelRows = toRows(cancelReasons).slice(0, 12);

  const closedRows = [
    { name: "Afgewerkt", value: totalDone },
    { name: "Geannuleerd", value: totalCancelled },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 p-4 space-y-5">
      <div className="rounded-[2rem] bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 p-7 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-100">
              📊 Admin analytics
            </div>
            <h1 className="mt-1 text-3xl font-black">
              Leads Performance Dashboard
            </h1>
            <p className="mt-2 text-sm text-blue-100">
              Interactieve analyse van afgewerkte leads, waarde, winkels,
              modellen, categorieën en annulaties.
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

      <form className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <select
            name="preset"
            defaultValue={preset}
            className="bb-select h-10 text-sm"
          >
            <option value="this_year">Dit jaar</option>
            <option value="this_month">Deze maand</option>
            <option value="last_90_days">Laatste 90 dagen</option>
            <option value="custom">Custom</option>
          </select>

          <input
            type="date"
            name="from"
            defaultValue={from}
            className="bb-input h-10 text-sm"
          />

          <input
            type="date"
            name="to"
            defaultValue={to}
            className="bb-input h-10 text-sm"
          />

          <button className="bb-btn h-10 text-sm" type="submit">
            Filter
          </button>

          <Link
            href="/admin/leads/analytics"
            className="bb-btn h-10 text-sm flex items-center justify-center"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon="✅" label="Afgewerkt" value={totalDone} />
        <StatCard icon="❌" label="Geannuleerd" value={totalCancelled} />
        <StatCard icon="💶" label="Totale waarde" value={eur(totalValue)} />
        <StatCard icon="📈" label="Gemiddelde waarde" value={eur(avgValue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="📅 Leads per maand">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" fill="#16a34a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="💰 Waarde per maand">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v) => `${v}€`} />
              <Legend />
              <Bar dataKey="value_eur" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📱 Waarde per model + aantallen">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#7c3aed" name="Waarde (€)" />
              <Bar dataKey="count" fill="#06b6d4" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🏬 Waarde per winkel + aantallen">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={shopRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#2563eb" name="Waarde (€)" />
              <Bar dataKey="count" fill="#16a34a" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🗂️ Waarde per categorie + aantallen">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#f97316" name="Waarde (€)" />
              <Bar dataKey="count" fill="#475569" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="✅ Afgewerkt vs geannuleerd">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={closedRows} dataKey="value" nameKey="name" outerRadius={110} label>
                {closedRows.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="❌ Redenen van annulering">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cancelRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={180} />
              <Tooltip />
              <Bar dataKey="value" fill="#dc2626" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="📱 Verhouding per categorie">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categoryRows} dataKey="count" nameKey="name" outerRadius={110} label>
                {categoryRows.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
