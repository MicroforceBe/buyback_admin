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
  delivery_method: string | null;
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

function inc(map: Map<string, number>, key: string | null | undefined, amount = 1) {
  const k = key?.trim() || "Onbekend";
  map.set(k, (map.get(k) || 0) + amount);
}

function topEntries(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function Bar({
  label,
  value,
  total,
  tone = "blue",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "blue" | "green" | "red" | "yellow" | "slate";
}) {
  const width = total > 0 ? Math.max(2, Math.round((value / total) * 100)) : 0;

  const color =
    tone === "green"
      ? "bg-green-600"
      : tone === "red"
      ? "bg-red-600"
      : tone === "yellow"
      ? "bg-yellow-500"
      : tone === "slate"
      ? "bg-slate-600"
      : "bg-blue-600";

  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
        <span className="font-medium whitespace-nowrap">
          {value} • {pct(value, total)}
        </span>
      </div>
      <div className="h-2 rounded bg-slate-100 overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
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
        "delivery_method",
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

  return (data || []) as Lead[];
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

  const leads = await getLeads();

  const total = leads.length;
  const done = leads.filter((l) => l.status === "done").length;
  const cancelled = leads.filter((l) => l.status === "cancelled").length;
  const open = leads.filter((l) => l.status !== "done" && l.status !== "cancelled").length;

  const voucher = leads.filter((l) => l.wants_voucher).length;
  const ship = leads.filter((l) => l.delivery_method === "ship").length;
  const dropoff = leads.filter((l) => l.delivery_method === "dropoff").length;

  const totalValueCents = leads.reduce((sum, l) => {
    const cents =
      l.wants_voucher && typeof l.final_price_with_voucher_cents === "number"
        ? l.final_price_with_voucher_cents
        : typeof l.final_price_cents === "number"
        ? l.final_price_cents
        : 0;

    return sum + cents;
  }, 0);

  const avgValueCents = total > 0 ? Math.round(totalValueCents / total) : 0;

  const byStatus = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byModel = new Map<string, number>();
  const byShop = new Map<string, number>();
  const byCancelReason = new Map<string, number>();

  for (const lead of leads) {
    inc(byStatus, lead.status);
    inc(byMonth, monthKey(lead.created_at));
    inc(byModel, lead.model);
    inc(byShop, lead.shop_location);

    if (lead.status === "cancelled") {
      inc(byCancelReason, lead.cancel_reason);
    }
  }

  const months = Array.from(byMonth.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const maxMonth = Math.max(1, ...months.map((x) => x[1]));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads analyse</h1>
          <p className="text-sm text-slate-500">
            Overzicht op basis van maximaal de laatste 5000 leads.
          </p>
        </div>

        <Link href="/admin/leads" className="bb-btn h-9 text-xs px-3">
          ← Terug naar leads
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Totaal leads</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Afgewerkt</div>
          <div className="text-2xl font-semibold text-green-700">
            {done} <span className="text-sm">({pct(done, total)})</span>
          </div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Openstaand</div>
          <div className="text-2xl font-semibold text-blue-700">
            {open} <span className="text-sm">({pct(open, total)})</span>
          </div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Geannuleerd</div>
          <div className="text-2xl font-semibold text-red-700">
            {cancelled} <span className="text-sm">({pct(cancelled, total)})</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Totale waarde</div>
          <div className="text-xl font-semibold">{eur(totalValueCents)}</div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Gemiddelde waarde</div>
          <div className="text-xl font-semibold">{eur(avgValueCents)}</div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Voucher</div>
          <div className="text-xl font-semibold">
            {voucher} <span className="text-sm">({pct(voucher, total)})</span>
          </div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-xs text-slate-500">Verzending / winkel</div>
          <div className="text-sm font-medium">
            Ship: {ship} • Dropoff: {dropoff}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Leads per status</h2>
          {topEntries(byStatus, 20).map(([label, value]) => (
            <Bar key={label} label={label} value={value} total={total} />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Leads per maand</h2>
          {months.map(([label, value]) => (
            <Bar key={label} label={label} value={value} total={maxMonth} tone="green" />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Top modellen</h2>
          {topEntries(byModel, 15).map(([label, value]) => (
            <Bar key={label} label={label} value={value} total={total} tone="slate" />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold">Leads per winkel</h2>
          {topEntries(byShop, 15).map(([label, value]) => (
            <Bar key={label} label={label} value={value} total={total} tone="yellow" />
          ))}
        </section>

        <section className="rounded border bg-white p-4 space-y-3 lg:col-span-2">
          <h2 className="font-semibold">Annulatie-redenen</h2>
          {cancelled === 0 ? (
            <p className="text-sm text-slate-500">Geen annulaties gevonden.</p>
          ) : (
            topEntries(byCancelReason, 20).map(([label, value]) => (
              <Bar key={label} label={label} value={value} total={cancelled} tone="red" />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
