
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
  Store,
  Sparkles,
  MapPinned,
  Globe2,
  Truck,
} from "lucide-react";
import type { AnalyticsLead } from "./page";

type Props = {
  leads: AnalyticsLead[];
  previousLeads: AnalyticsLead[];
  from: string;
  to: string;
  preset: string;
  previousFrom: string;
  previousTo: string;
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

function monthKey(date: string | null, includeYear = true) {
  if (!date) return "Onbekend";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "Onbekend";

  return d.toLocaleDateString("nl-BE", {
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
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

function channelLabel(lead: AnalyticsLead) {
  if (lead.delivery_method === "ship") return "Verzending";
  if (lead.delivery_method === "dropoff") return lead.shop_location || "Onbekend winkel";
  return lead.shop_location || "Onbekend";
}

function countryLabel(lead: AnalyticsLead) {
  return lead.country?.trim() || "Onbekend";
}

function provinceLabel(lead: AnalyticsLead) {
  const country = (lead.country || "").trim().toLowerCase();

  if (country && !["be", "belgië", "belgie", "belgium"].includes(country)) {
    return "Buitenland";
  }

  const postal = String(lead.postal_code || "").trim();

  if (!postal) return "Onbekend";
  if (!/^\d{4}$/.test(postal)) return "Onbekend";

  const n = Number(postal);

  if (n >= 1000 && n <= 1299) return "Brussel";
  if (n >= 1300 && n <= 1499) return "Waals-Brabant";
  if (n >= 1500 && n <= 1999) return "Vlaams-Brabant";
  if (n >= 2000 && n <= 2999) return "Antwerpen";
  if (n >= 3000 && n <= 3499) return "Vlaams-Brabant";
  if (n >= 3500 && n <= 3999) return "Limburg";
  if (n >= 4000 && n <= 4999) return "Luik";
  if (n >= 5000 && n <= 5999) return "Namen";
  if (n >= 6000 && n <= 6599) return "Henegouwen";
  if (n >= 6600 && n <= 6999) return "Luxemburg";
  if (n >= 7000 && n <= 7999) return "Henegouwen";
  if (n >= 8000 && n <= 8999) return "West-Vlaanderen";
  if (n >= 9000 && n <= 9999) return "Oost-Vlaanderen";

  return "Onbekend";
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

function pctDiff(current: number, previous: number) {
  if (!previous && !current) return "0%";
  if (!previous) return "+100%";

  const diff = ((current - previous) / previous) * 100;
  const rounded = Math.round(diff);

  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function cancelRate(cancelled: number, done: number) {
  const total = cancelled + done;
  if (!total) return 0;
  return Math.round((cancelled / total) * 100);
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
    delivery_method: r.delivery_method || "",
    channel: channelLabel(r),
    shop_location: r.shop_location || "",
    city: r.city || "",
    postal_code: r.postal_code || "",
    province: provinceLabel(r),
    country: r.country || "",
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

function buildBasicStats(rows: AnalyticsLead[]) {
  const doneLeads = rows.filter((l) => l.status === "done");
  const cancelledLeads = rows.filter((l) => l.status === "cancelled");

  const totalValue = doneLeads.reduce(
    (sum, lead) => sum + leadValueCents(lead),
    0
  );

  return {
    done: doneLeads.length,
    cancelled: cancelledLeads.length,
    total: rows.length,
    totalValue,
    avgValue: doneLeads.length > 0 ? Math.round(totalValue / doneLeads.length) : 0,
  };
}

export default function AnalyticsClient({
  leads,
  previousLeads,
  from,
  to,
  preset,
  previousFrom,
  previousTo,
}: Props) {
  const [channelFilter, setChannelFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [selectedPreset, setSelectedPreset] = useState(preset);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const channel = channelLabel(lead);
      const category = categoryLabel(lead.model);
      const status = lead.status || "Onbekend";
      const province = provinceLabel(lead);
      const country = countryLabel(lead);

      if (channelFilter !== "all" && channel !== channelFilter) return false;
      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (provinceFilter !== "all" && province !== provinceFilter) return false;
      if (countryFilter !== "all" && country !== countryFilter) return false;

      return true;
    });
  }, [leads, channelFilter, categoryFilter, statusFilter, provinceFilter, countryFilter]);

  const previousFilteredLeads = useMemo(() => {
    return previousLeads.filter((lead) => {
      const channel = channelLabel(lead);
      const category = categoryLabel(lead.model);
      const status = lead.status || "Onbekend";
      const province = provinceLabel(lead);
      const country = countryLabel(lead);

      if (channelFilter !== "all" && channel !== channelFilter) return false;
      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (provinceFilter !== "all" && province !== provinceFilter) return false;
      if (countryFilter !== "all" && country !== countryFilter) return false;

      return true;
    });
  }, [
    previousLeads,
    channelFilter,
    categoryFilter,
    statusFilter,
    provinceFilter,
    countryFilter,
  ]);

  const previousStats = useMemo(
    () => buildBasicStats(previousFilteredLeads),
    [previousFilteredLeads]
  );

  const stats = useMemo(() => {
    const doneLeads = filteredLeads.filter((l) => l.status === "done");
    const cancelledLeads = filteredLeads.filter((l) => l.status === "cancelled");

    let totalValue = 0;

    const monthlyCount = new Map<string, number>();
    const monthlyValue = new Map<string, number>();
    const previousMonthlyCount = new Map<string, number>();
    const previousMonthlyValue = new Map<string, number>();

    const modelCount = new Map<string, number>();
    const modelValue = new Map<string, number>();

    const channelCount = new Map<string, number>();
    const channelValue = new Map<string, number>();
    const channelDone = new Map<string, number>();
    const channelCancelled = new Map<string, number>();

    const provinceCount = new Map<string, number>();
    const provinceValue = new Map<string, number>();

    const countryCount = new Map<string, number>();
    const countryValue = new Map<string, number>();

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
      const month = monthKey(lead.created_at, false);
      const model = modelLabel(lead);
      const channel = channelLabel(lead);
      const category = categoryLabel(lead.model);
      const province = provinceLabel(lead);
      const country = countryLabel(lead);

      if (status === "done") {
        totalValue += value;

        inc(monthlyCount, month);
        inc(monthlyValue, month, value);

        inc(modelCount, model);
        inc(modelValue, model, value);

        inc(channelCount, channel);
        inc(channelValue, channel, value);
        inc(channelDone, channel);

        inc(provinceCount, province);
        inc(provinceValue, province, value);

        inc(countryCount, country);
        inc(countryValue, country, value);

        inc(categoryCount, category);
        inc(categoryValue, category, value);
      }

      if (status === "cancelled") {
        inc(cancelReasons, lead.cancel_reason || "Geen reden opgegeven");
        inc(channelCancelled, channel);
      }

      if (status === "new") funnel.new += 1;
      if (status.includes("received") || status.includes("shipment")) {
        funnel.received += 1;
      }
      if (status.includes("check")) funnel.checked += 1;
      if (status === "done") funnel.done += 1;
      if (status === "cancelled") funnel.cancelled += 1;
    }

    for (const lead of previousFilteredLeads) {
      if (lead.status !== "done") continue;

      const value = leadValueCents(lead);
      const month = monthKey(lead.created_at, false);

      inc(previousMonthlyCount, month);
      inc(previousMonthlyValue, month, value);
    }

    const monthOrder = [
      "jan",
      "feb",
      "mrt",
      "apr",
      "mei",
      "jun",
      "jul",
      "aug",
      "sep",
      "okt",
      "nov",
      "dec",
    ];

    const allMonths = Array.from(
      new Set([
        ...Array.from(monthlyCount.keys()),
        ...Array.from(previousMonthlyCount.keys()),
      ])
    ).sort((a, b) => {
      const ai = monthOrder.findIndex((m) => a.toLowerCase().startsWith(m));
      const bi = monthOrder.findIndex((m) => b.toLowerCase().startsWith(m));
      return ai - bi;
    });

    const monthRows = allMonths.map((month) => ({
      month,
      leads: monthlyCount.get(month) || 0,
      leads_vorig_jaar: previousMonthlyCount.get(month) || 0,
      value_cents: monthlyValue.get(month) || 0,
      value_eur: Math.round((monthlyValue.get(month) || 0) / 100),
      value_vorig_jaar_eur: Math.round(
        (previousMonthlyValue.get(month) || 0) / 100
      ),
    }));

    const modelRows = toRows(modelValue)
      .slice(0, 15)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: modelCount.get(String((r as any).name)) || 0,
      }));

    const channelRows = toRows(channelValue)
      .slice(0, 12)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: channelCount.get(String((r as any).name)) || 0,
      }));

    const channelScoreRows = Array.from(
      new Set([...Array.from(channelDone.keys()), ...Array.from(channelCancelled.keys())])
    )
      .map((channel) => {
        const done = channelDone.get(channel) || 0;
        const cancelled = channelCancelled.get(channel) || 0;
        const value = channelValue.get(channel) || 0;

        return {
          channel,
          done,
          cancelled,
          value,
          avgValue: done > 0 ? Math.round(value / done) : 0,
          cancelRate: cancelRate(cancelled, done),
        };
      })
      .sort((a, b) => b.value - a.value);

    const provinceRows = toRows(provinceValue)
      .slice(0, 15)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: provinceCount.get(String((r as any).name)) || 0,
      }));

    const countryRows = toRows(countryValue)
      .slice(0, 15)
      .map((r) => ({
        name: String((r as any).name),
        value_cents: Number(r.value),
        value_eur: Math.round(Number(r.value) / 100),
        count: countryCount.get(String((r as any).name)) || 0,
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

    const bestChannel = channelScoreRows[0] || null;
    const bestModel = modelRows[0] || null;
    const bestCategory = categoryRows[0] || null;
    const highestCancelChannel = [...channelScoreRows]
      .filter((x) => x.done + x.cancelled >= 3)
      .sort((a, b) => b.cancelRate - a.cancelRate)[0] || null;

    return {
      doneLeads,
      cancelledLeads,
      totalValue,
      avgValue:
        doneLeads.length > 0 ? Math.round(totalValue / doneLeads.length) : 0,
      monthRows,
      modelRows,
      channelRows,
      channelScoreRows,
      provinceRows,
      countryRows,
      categoryRows,
      cancelRows,
      closedRows,
      funnelRows,
      bestChannel,
      bestModel,
      bestCategory,
      highestCancelChannel,
    };
  }, [filteredLeads, previousFilteredLeads]);

  const channels = useMemo(
    () => Array.from(new Set(leads.map((l) => channelLabel(l)))).sort(),
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

  const provinces = useMemo(
    () => Array.from(new Set(leads.map((l) => provinceLabel(l)))).sort(),
    [leads]
  );

  const countries = useMemo(
    () => Array.from(new Set(leads.map((l) => countryLabel(l)))).sort(),
    [leads]
  );

  const insights = [
    stats.bestChannel
      ? `Beste kanaal/winkel op waarde: ${stats.bestChannel.channel} met ${euro(stats.bestChannel.value)} uit ${stats.bestChannel.done} afgewerkte leads.`
      : null,
    stats.bestModel
      ? `Topmodel op waarde: ${stats.bestModel.name} met ${euro(stats.bestModel.value_cents)} en ${stats.bestModel.count} leads.`
      : null,
    stats.bestCategory
      ? `Sterkste categorie: ${stats.bestCategory.name} met ${euro(stats.bestCategory.value_cents)} totaal.`
      : null,
    stats.highestCancelChannel
      ? `Hoogste annulatiegraad: ${stats.highestCancelChannel.channel} met ${stats.highestCancelChannel.cancelRate}%.`
      : null,
  ].filter(Boolean);

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
              Analyse met aparte vergelijking voor winkels, verzending, provincie en land.
            </p>

            <p className="mt-2 text-xs text-blue-200">
              Periode: {from || "All time"} → {to}{" "}
              {previousFrom && previousTo
                ? `• Vorig jaar: ${previousFrom} → ${previousTo}`
                : "• Geen vorig jaar vergelijking bij all time"}
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

<form
  action="/admin/leads/analytics"
  className="rounded-3xl border bg-white p-4 shadow-sm"
>
  <div className="grid gap-3 md:grid-cols-5">
    <select
      name="preset"
      value={selectedPreset}
      className="bb-select h-10 text-sm"
      onChange={(e) => {
        const next = e.target.value;
        setSelectedPreset(next);

        if (next !== "custom") {
          window.setTimeout(() => {
            e.currentTarget.form?.requestSubmit();
          }, 0);
        }
      }}
    >
      <option value="this_year">Dit jaar</option>
      <option value="this_month">Deze maand</option>
      <option value="last_60_days">Laatste 60 dagen</option>
      <option value="last_90_days">Laatste 90 dagen</option>
      <option value="last_12_months">Laatste 12 maanden</option>
      <option value="all_time">All time</option>
      <option value="custom">Custom</option>
    </select>

    {selectedPreset === "custom" && (
      <>
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
      </>
    )}

    {selectedPreset !== "custom" && (
      <div className="md:col-span-3 flex items-center text-sm text-slate-500">
        Periode wordt automatisch bepaald door de gekozen preset.
      </div>
    )}

    <Link
      href="/admin/leads/analytics"
      className="bb-btn h-10 text-sm flex items-center justify-center"
    >
      Reset
    </Link>
  </div>
</form>


      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle winkels / verzending</option>
            {channels.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle provincies</option>
            {provinces.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="bb-select h-10 text-sm"
          >
            <option value="all">Alle landen</option>
            {countries.map((s) => (
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

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Sparkles size={18} />
          Management summary
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((txt, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-slate-50 p-4 text-sm font-medium text-slate-700"
            >
              {txt}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card
          icon={<Euro size={22} />}
          title="Totale waarde"
          value={euro(stats.totalValue)}
          sub={`${pctDiff(stats.totalValue, previousStats.totalValue)} vs vorig jaar`}
        />

        <Card
          icon={<CheckCircle2 size={22} />}
          title="Afgewerkt"
          value={String(stats.doneLeads.length)}
          sub={`${pctDiff(stats.doneLeads.length, previousStats.done)} vs vorig jaar`}
        />

        <Card
          icon={<XCircle size={22} />}
          title="Geannuleerd"
          value={String(stats.cancelledLeads.length)}
          sub={`${pctDiff(stats.cancelledLeads.length, previousStats.cancelled)} vs vorig jaar`}
        />

        <Card
          icon={<Activity size={22} />}
          title="Gefilterde leads"
          value={String(filteredLeads.length)}
          sub={`${pctDiff(filteredLeads.length, previousStats.total)} vs vorig jaar`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Leads per maand vs vorig jaar">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={stats.monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" name="Leads huidig jaar" radius={[8, 8, 0, 0]} fill="#2563eb" />
              <Bar dataKey="leads_vorig_jaar" name="Leads vorig jaar" radius={[8, 8, 0, 0]} fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per maand vs vorig jaar">
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={stats.monthRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `${value}€`} />
              <Legend />
              <Area type="monotone" dataKey="value_eur" name="Waarde huidig jaar (€)" stroke="#7c3aed" fill="#c4b5fd" />
              <Area type="monotone" dataKey="value_vorig_jaar_eur" name="Waarde vorig jaar (€)" stroke="#64748b" fill="#cbd5e1" />
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

        <ChartCard title="Waarde per winkel / verzending + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.channelRows} layout="vertical">
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

        <ChartCard title="Waarde per provincie + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.provinceRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#0891b2" name="Waarde (€)" />
              <Bar dataKey="count" fill="#475569" name="Aantal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Waarde per land + aantallen">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={stats.countryRows} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value_eur" fill="#db2777" name="Waarde (€)" />
              <Bar dataKey="count" fill="#64748b" name="Aantal" />
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
              <Pie data={stats.closedRows} dataKey="value" nameKey="name" outerRadius={130} label>
                {stats.closedRows.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-6 py-4 text-lg font-semibold flex items-center gap-2">
          <Truck size={18} />
          Winkel / verzending scorecard
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Kanaal</th>
                <th className="px-4 py-3 text-right">Waarde</th>
                <th className="px-4 py-3 text-right">Afgewerkt</th>
                <th className="px-4 py-3 text-right">Gem. waarde</th>
                <th className="px-4 py-3 text-right">Geannuleerd</th>
                <th className="px-4 py-3 text-right">Cancel rate</th>
              </tr>
            </thead>

            <tbody>
              {stats.channelScoreRows.map((row) => (
                <tr key={row.channel} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{row.channel}</td>
                  <td className="px-4 py-3 text-right">{euro(row.value)}</td>
                  <td className="px-4 py-3 text-right">{row.done}</td>
                  <td className="px-4 py-3 text-right">{euro(row.avgValue)}</td>
                  <td className="px-4 py-3 text-right">{row.cancelled}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        row.cancelRate >= 30
                          ? "bg-red-100 text-red-700"
                          : row.cancelRate >= 15
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {row.cancelRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                <th className="px-4 py-3 text-left">Kanaal</th>
                <th className="px-4 py-3 text-left">Provincie</th>
                <th className="px-4 py-3 text-left">Land</th>
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
                  <td className="px-4 py-3">{channelLabel(lead)}</td>
                  <td className="px-4 py-3">{provinceLabel(lead)}</td>
                  <td className="px-4 py-3">{countryLabel(lead)}</td>
                  <td className="px-4 py-3">{lead.status || "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {euro(leadValueCents(lead))}
                  </td>
                  <td className="px-4 py-3">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
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
  sub,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-slate-500">{title}</div>
        <div className="text-slate-400">{icon}</div>
      </div>

      <div className="mt-4 text-3xl font-bold">{value}</div>

      {sub && <div className="mt-2 text-xs font-medium text-slate-500">{sub}</div>}
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
