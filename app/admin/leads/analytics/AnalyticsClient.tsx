//app/admin/leads/analytics/AnalyticsClient.tsx
"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  FunnelChart,
  Funnel,
  LabelList,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Euro,
  XCircle,
  CheckCircle2,
  Activity,
  Download,
  RefreshCw,
} from "lucide-react";
import type { AnalyticsLead } from "./page";

type Props = {
  leads: AnalyticsLead[];
  from: string;
  to: string;
  preset: string;
};

const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#ea580c",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#475569",
];

function euro(cents: number) {
  return `€${(cents / 100).toLocaleString("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthKey(date: string | null) {
  if (!date) return "Onbekend";

  const d = new Date(date);

  if (!Number.isFinite(d.getTime())) {
    return "Onbekend";
  }

  return d.toLocaleDateString("nl-BE", {
    month: "short",
    year: "numeric",
  });
}

function leadValueCents(lead: AnalyticsLead) {
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

function modelLabel(lead: AnalyticsLead) {
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
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + amount);
}

function toRows(map: Map<string, number>, keyName = "name") {
  return Array.from(map.entries())
    .map(([key, value]) => ({
      [keyName]: key,
      value,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

function exportCsv(rows: AnalyticsLead[]) {
  const exportRows = rows.map((r) => ({
    order_code: r.order_code || "",
    created_at: r.created_at || "",
    status: r.status || "",
    model: r.model || "",
    capacity_gb: r.capacity_gb || "",
    sku: r.sku || "",
    imei_sn: r.imei_sn || "",
    shop_location: r.shop_location || "",
    customer: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
    email: r.email || "",
    value_eur: (leadValueCents(r) / 100).toFixed(2),
    cancel_reason: r.cancel_reason || "",
  }));

  const headers = Object.keys(exportRows[0] || {});

  const csv = [
    headers.join(","),
    ...exportRows.map((row) =>
      headers
        .map((h) => `"${String((row as any)[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "leads-analytics.csv";
  a.click();

  URL.revokeObjectURL(url);
}

export default function AnalyticsClient({ leads, from, to, preset }: Props) {
  const [shopFilter, setShopFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const shop = lead.shop_location || "Onbekend";
      const category = categoryLabel(lead.model);
      const status = lead.status || "Onbekend";

      if (shopFilter !== "all" && shop !== shopFilter) return false;
      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;

      return true;
    });
  }, [leads, shopFilter, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const doneLeads = filteredLeads.filter((l) => l.status === "done");
    const cancelledLeads = filteredLeads.filter((l) => l.status === "cancelled");

    let totalValue = 0;

    const monthlyCount = new Map<string, number>();
    const monthlyValue = new Map<string, number>();

    const modelCount = new Map<string, number>();
    const modelValue = new Map<string, number>();

    const shopCount = new Map<string, number>();
    const shopValue = new Map<string, number>();

    const categoryCount = new Map<string, number>();
    const categoryValue = new Map<string, number>();

    const cancelReasons = new Map<string, number>();

    const funnel = {
      new: 0,
      received: 0,
      checked: 0,
      done: 0,
      cancelled: 0,
    };

    for (const lead of filteredLeads) {
      const status = lead.status || "";
      const value = leadValueCents(lead);
      const month = monthKey(lead.created_at);
      const model = modelLabel(lead);
      const shop = lead.shop_location || "Onbekend";
      const category = categoryLabel(lead.model);

      if (status === "done") {
        totalValue += value;

        inc(monthlyCount, month);
        inc(monthlyValue, month, value);

        inc(modelCount, model);
        inc(modelValue, model, value);

        inc(shopCount, shop);
        inc(shopValue, shop, value);

        inc(categoryCount, category);
        inc(categoryValue, category, value);
      }

      if (status === "cancelled") {
        inc(cancelReasons, lead.cancel_reason || "Geen reden opgegeven");
      }

      if (status === "new") funnel.new += 1;
      if (status.includes("received") || status.includes("shipment")) {
        funnel.received += 1;
      }
      if (status.includes("check")) funnel.checked += 1;
      if (status === "done") funnel.done += 1;
      if (status === "cancelled") funnel.cancelled += 1;
    }

    const monthRows = Array.from(monthlyCount.entries())
      .map(([month, count]) => ({
        month,
        leads: count,
        value_cents: monthlyValue.get(month) || 0,
        value_eur: Math.round((monthlyValue.get(month) || 0) / 100),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const modelRows = toRows(modelValue)
      .slice(0, 15)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: modelCount.get(String((r as any).name)) || 0,
      }));

    const shopRows = toRows(shopValue)
      .slice(0, 12)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: shopCount.get(String((r as any).name)) || 0,
      }));

    const categoryRows = toRows(categoryValue).map((r) => ({
      name: String((r as any).name),
      value_cents: Number(r.value),
      value_eur: Math.round(Number(r.value) / 100),
      count: categoryCount.get(String((r as any).name)) || 0,
    }));

    const cancelRows = toRows(cancelReasons)
      .slice(0, 12)
      .map((r) => ({
        name: String((r as any).name),
        value: Number(r.value),
      }));

    const closedRows = [
      { name: "Afgewerkt", value: doneLeads.length },
      { name: "Geannuleerd", value: cancelledLeads.length },
    ];

    const funnelRows = [
      { name: "Nieuw", value: funnel.new, fill: "#2563eb" },
      { name: "Ontvangen", value: funnel.received, fill: "#0891b2" },
      { name: "Controle", value: funnel.checked, fill: "#7c3aed" },
      { name: "Afgewerkt", value: funnel.done, fill: "#059669" },
      { name: "Geannuleerd", value: funnel.cancelled, fill: "#dc2626" },
    ];

    return {
      doneLeads,
      cancelledLeads,
      totalValue,
      avgValue:
        doneLeads.length > 0 ? Math.round(totalValue / doneLeads.length) : 0,
      monthRows,
      modelRows,
      shopRows,
      categoryRows,
      cancelRows,
      closedRows,
      funnelRows,
    };
  }, [filteredLeads]);

  const shops = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.shop_location || "Onbekend"))).sort(),
    [leads]
  );

  const categories = useMemo(
    () => Array.from(new Set(leads.map((l) => categoryLabel(l.model)))).sort(),
    [leads]
  );

  const statuses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.status || "Onbekend"))).sort(),
    [leads]
  );

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

            <p className="mt-2 text-xs text-blue-200">
              Periode: {from} → {to} • Preset: {preset}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              onClick={() => exportCsv(filteredLeads)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-500"
              type="button"
            >
              <Download size={16} />
              Export CSV
            </button>

            <Link
              href="/admin/leads"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              ← Terug
            </Link>
          </div>
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
            <option value="last_12_months">Laatste 12 maanden</option>
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

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle winkels</option>
            {shops.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle categorieën</option>
            {categories.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle statussen</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card
          icon={<Euro size={22} />}
          title="Totale waarde"
          value={euro(stats.totalValue)}
        />

        <Card
          icon={<CheckCircle2 size={22} />}
          title="Afgewerkt"
          value={String(stats.doneLeads.length)}
        />

        <Card
          icon={<XCircle size={22} />}
          title="Geannuleerd"
          value={String(stats.cancelledLeads.length)}
        />

        <Card
          icon={<Activity size={22} />}
          title="Gefilterde leads"
          value={String(filteredLeads.length)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Leads per maand">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={stats.monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="leads"
                name="Leads"
                radius={[8, 8, 0, 0]}
                fill="#2563eb"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per maand">
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={stats.monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `${value}€`} />
              <Legend />
              <Area
                type="monotone"
                dataKey="value_eur"
                name="Waarde (€)"
                stroke="#7c3aed"
                fill="#c4b5fd"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per model + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.modelRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#7c3aed" name="Waarde (€)" />
              <Bar dataKey="count" fill="#06b6d4" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per winkel + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.shopRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#2563eb" name="Waarde (€)" />
              <Bar dataKey="count" fill="#16a34a" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per categorie + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.categoryRows}>
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

        <ChartCard title="Afgewerkt vs geannuleerd">
          <ResponsiveContainer width="100%" height={420}>
            <PieChart>
              <Pie
                data={stats.closedRows}
                dataKey="value"
                nameKey="name"
                outerRadius={130}
                label
              >
                {stats.closedRows.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead funnel">
          <ResponsiveContainer width="100%" height={420}>
            <FunnelChart>
              <Tooltip />
              <Funnel
                dataKey="value"
                data={stats.funnelRows}
                isAnimationActive
              >
                <LabelList
                  position="right"
                  fill="#111827"
                  stroke="none"
                  dataKey="name"
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Redenen van annulering">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.cancelRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={180} />
              <Tooltip />
              <Bar dataKey="value" fill="#dc2626" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Verhouding per categorie">
          <ResponsiveContainer width="100%" height={420}>
            <PieChart>
              <Pie
                data={stats.categoryRows}
                dataKey="count"
                nameKey="name"
                outerRadius={130}
                label
              >
                {stats.categoryRows.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-6 py-4 text-lg font-semibold">
          Drill-down leads
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">Winkel</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Waarde</th>
                <th className="px-4 py-3 text-left">Klant</th>
              </tr>
            </thead>

            <tbody>
              {filteredLeads.slice(0, 50).map((lead) => (
                <tr key={lead.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">{lead.order_code || "—"}</td>
                  <td className="px-4 py-3">{modelLabel(lead)}</td>
                  <td className="px-4 py-3">{lead.shop_location || "—"}</td>
                  <td className="px-4 py-3">{lead.status || "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {euro(leadValueCents(lead))}
                  </td>
                  <td className="px-4 py-3">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  value,
}: {
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-slate-500">{title}</div>
        <div className="text-slate-400">{icon}</div>
      </div>

      <div className="mt-4 text-3xl font-bold">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <TrendingUp size={18} />
        {title}
      </div>

      {children}
    </div>
  );
}
