// app/admin/leads/analytics/page.tsx
// Focus: afgewerkte leads

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
  if (
    lead.wants_voucher &&
    typeof lead.final_price_with_voucher_cents === "number"
  ) {
    return lead.final_price_with_voucher_cents;
  }

  if (typeof lead.final_price_cents === "number") {
    return lead.final_price_cents;
  }

  return 0;
}

function incCount(map: Map<string, number>, key: string | null | undefined) {
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + 1);
}

function incValue(
  map: Map<string, number>,
  key: string | null | undefined,
  value: number
) {
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + value);
}

function topEntries(map: Map<string, number>, limit = 12) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function BarValue({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
        <span className="font-medium whitespace-nowrap">{eur(value)}</span>
      </div>
      <div className="h-2 rounded bg-slate-100 overflow-hidden">
        <div className="h-full rounded bg-blue-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function BarCount({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
        <span className="font-medium whitespace-nowrap">{value}</span>
      </div>
      <div className="h-2 rounded bg-slate-100 overflow-hidden">
        <div className="h-full rounded bg-green-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MiniPie({
  rows,
  title,
}: {
  rows: [string, number][];
  title: string;
}) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0);

  let cursor = 0;
  const colors = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#ca8a04",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#475569",
  ];

  const gradient =
    total > 0
      ? rows
          .map(([, value], index) => {
            const start = cursor;
            const end = cursor + (value / total) * 100;
            cursor = end;
            return `${colors[index % colors.length]} ${start}% ${end}%`;
          })
          .join(", ")
      : "#e2e8f0 0% 100%";

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="font-semibold mb-3">{title}</h2>

      <div className="flex gap-4 items-center">
        <div
          className="h-32 w-32 rounded-full border"
          style={{ background: `conic-gradient(${gradient})` }}
        />

        <div className="space-y-1 text-xs flex-1">
          {rows.map(([label, value], index) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 truncate">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="truncate">{label}</span>
              </span>
              <span className="font-medium whitespace-nowrap">
                {Math.round((value / total) * 100) || 0}%
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

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  if ((adminUser as any).role !== "admin") {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-3">Leads analyse</h1>
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
    const model = [
      lead.model || "Onbekend",
      lead.capacity_gb ? `${lead.capacity_gb}GB` : null,
    ]
      .filter(Boolean)
      .join(" ");

    incCount(byMonthCount, monthKey(lead.created_at));
    incValue(byMonthValue, monthKey(lead.created_at), value);

    incCount(byShopCount, lead.shop_location);
    incValue(byShopValue, lead.shop_location, value);

    incCount(byModelCount, model);
    incValue(byModelValue, model, value);
  }

  const monthCountRows = Array.from(byMonthCount.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const monthValueRows = Array.from(byMonthValue.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const maxMonthCount = Math.max(1, ...monthCountRows.map((x) => x[1]));
  const maxMonthValue = Math.max(1, ...monthValueRows.map((x) => x[1]));
  const maxShopValue = Math.max(1, ...topEntries(byShopValue, 20).map((x) => x[1]));
  const maxModelValue = Math.max(1, ...topEntries(byModelValue, 20).map((x) => x[1]));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Analyse afgewerkte leads</h1>
          <p className="text-sm text-slate-500">
            Analyse op basis van leads met status <b>done</b>.
          </p>
        </div>

        <Link href="/admin/leads" className="bb-btn h-9 text-xs px-3">
          ← Terug naar leads
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Afgewerkte leads</div>
          <div className="text-2xl font-semibold">{totalDone}</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Totale waarde</div>
          <div className="text-2xl font-semibold">{eur(totalValue)}</div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Gemiddelde waarde</div>
          <div className="text-2xl font-semibold">{eur(avgValue)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Leads per maand</h2>
          {monthCountRows.map(([label, value]) => (
            <BarCount key={label} label={label} value={value} max={maxMonthCount} />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Waarde per maand</h2>
          {monthValueRows.map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxMonthValue} />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Waarde per winkel</h2>
          {topEntries(byShopValue, 20).map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxShopValue} />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Waarde per model</h2>
          {topEntries(byModelValue, 20).map(([label, value]) => (
            <BarValue key={label} label={label} value={value} max={maxModelValue} />
          ))}
        </section>

        <MiniPie
          title="Verhouding per toestel/model"
          rows={topEntries(byModelCount, 8)}
        />

        <MiniPie
          title="Verhouding per winkel"
          rows={topEntries(byShopCount, 8)}
        />
      </div>
    </div>
  );
}
