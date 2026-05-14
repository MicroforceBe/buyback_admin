// app/admin/leads/analytics/page.tsx

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import AnalyticsClient from "./AnalyticsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  from?: string;
  to?: string;
  preset?: string;
};

export type AnalyticsLead = {
  id: string;
  order_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  status: string | null;
  delivery_method: string | null;
  shop_location: string | null;
  model: string | null;
  capacity_gb: number | null;
  variant: string | null;
  sku: string | null;
  imei_sn: string | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;
  wants_voucher: boolean | null;
  cancel_reason: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status_history: any[] | null;
};

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shiftYear(date: string, years: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return toIsoDate(d);
}

function getDateRange(searchParams: SearchParams) {
  const now = new Date();
  const preset = searchParams.preset || "this_year";

  let from = searchParams.from || "";
  let to = searchParams.to || "";

  if (!from && !to) {
    if (preset === "this_month") {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}-01`;
    } else if (preset === "last_90_days") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      from = toIsoDate(d);
    } else if (preset === "last_12_months") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      from = toIsoDate(d);
    } else {
      from = `${now.getFullYear()}-01-01`;
    }

    to = toIsoDate(now);
  }

  const previousFrom = from ? shiftYear(from, -1) : "";
  const previousTo = to ? shiftYear(to, -1) : "";

  return {
    from,
    to,
    preset,
    previousFrom,
    previousTo,
  };
}

async function getLeads(from: string, to: string): Promise<AnalyticsLead[]> {
  let query = supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id",
        "order_code",
        "created_at",
        "updated_at",
        "status",
        "delivery_method",
        "shop_location",
        "model",
        "capacity_gb",
        "variant",
        "sku",
        "imei_sn",
        "final_price_cents",
        "final_price_with_voucher_cents",
        "wants_voucher",
        "cancel_reason",
        "first_name",
        "last_name",
        "email",
        "status_history",
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .limit(10000);

  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data, error } = await query;

  if (error) {
    console.error("[LEADS ANALYTICS] fetch error", error);
    return [];
  }

  return (data || []) as unknown as AnalyticsLead[];
}

export default async function LeadsAnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  if ((adminUser as any).role !== "admin") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Alleen admins mogen deze analyse bekijken.
        </div>
      </div>
    );
  }

  const { from, to, preset, previousFrom, previousTo } =
    getDateRange(searchParams);

  const [leads, previousLeads] = await Promise.all([
    getLeads(from, to),
    getLeads(previousFrom, previousTo),
  ]);

  return (
    <AnalyticsClient
      leads={leads}
      previousLeads={previousLeads}
      from={from}
      to={to}
      preset={preset}
      previousFrom={previousFrom}
      previousTo={previousTo}
    />
  );
}
