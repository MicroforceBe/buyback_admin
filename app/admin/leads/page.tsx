import LocalDate from '@/app/admin/LocalDate';
import { requirePageAccess } from '@/lib/security/access';
// app/admin/leads/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  updateLeadInlineAction,
  deleteLeadAction,
  resyncSendcloudLabelAction,
} from "./actions";
import CustomerCell from "./CustomerCell";
import DeviceCell from "./DeviceCell";
import styles from "./leads.module.css";
import {getLeadLabelReadiness} from "./labelData";
import LeadStatusForm from "./LeadStatusForm";
import { leadValidationMessage } from "@/lib/leadDeviceValidation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Eén centrale status-union die matcht met je DB
type Status =
  | "new"
  | "label_created"
  | "reminder_1_dropoff"
  | "reminder_2_dropoff"
  | "reminder_3_dropoff"
  | "received_store"
  | "reminder_1_ship"
  | "reminder_2_ship"
  | "reminder_3_ship"
  | "shipment_received"
  | "check_passed"
  | "check_failed_technical"
  | "check_failed_grading"
  | "done"
  | "cancelled";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "new", label: "Nieuw" },
  { value: "label_created", label: "Verzendlabel aangemaakt" },
  { value: "reminder_1_dropoff", label: "Reminder 1 Binnenbrengen" },
  { value: "reminder_2_dropoff", label: "Reminder 2 Binnenbrengen" },
  { value: "reminder_3_dropoff", label: "Reminder 3 Binnenbrengen" },
  { value: "received_store", label: "Ontvangen in de winkel" },
  { value: "reminder_1_ship", label: "Reminder 1 Opzenden" },
  { value: "reminder_2_ship", label: "Reminder 2 Opzenden" },
  { value: "reminder_3_ship", label: "Reminder 3 Opzenden" },
  { value: "shipment_received", label: "Zending ontvangen" },
  { value: "check_passed", label: "Controle succesvol" },
  {
    value: "check_failed_technical",
    label: "Controle gefaald, technisch defect",
  },
  {
    value: "check_failed_grading",
    label: "Controle gefaald, gradering",
  },
  { value: "done", label: "Afgewerkt" },
  { value: "cancelled", label: "Geannuleerd" },
];

async function getLeads(): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin
    .from("buyback_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Error fetching leads:", error);
    return [];
  }
  return (data ?? []) as Lead[];
}

type StatusHistoryEntry = {
  type?: string;
  at?: string;
  by?: string | null;
  from?: any;
  to?: any;
  from_sku?: string | null;
  to_sku?: string | null;
  from_imei_sn?: string | null;
  to_imei_sn?: string | null;
};

type Lead = {
  id: string;
  order_code: string | null;
  created_at: string | null;

  // toestel
  model: string | null;
  capacity_gb: number | null;
  variant: string | null;
  questions_answers_html: string | null;
  sku: string | null;
  imei_sn: string | null;
  battery_percentage: number | null;
  used_parts_skus: string[] | null;

  // prijzen
  base_price_cents: number | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;

  // klant
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;

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
  wants_voucher: boolean | null;

  // admin
  status: Status | null;
  admin_note: string | null;
  updated_at: string | null;

  // verzendlabel & tracking
  tracking_code?: string | null;
  tracking_url?: string | null;
  label_pdf_url?: string | null;

  // reden annulatie
  cancel_reason?: string | null;

  // status-history (JSONB)
  status_history?: StatusHistoryEntry[] | null;
};

type SearchParams = {
  msg?: string;
  fields?: string;
  q?: string;
  from?: string;
  to?: string;

  order?: string;
  customer?: string;
  model?: string;
  variant?: string;
  status?: string;
  method?: "ship" | "dropoff" | "";
  price_min?: string;
  price_max?: string;
  city?: string;
  shop?: string;
  voucher?: "yes" | "no" | "";

  sort?: string;
  dir?: "asc" | "desc";
  page?: string;
  limit?: string;
};

function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return <LocalDate value={ts} withTime timeZone="Europe/Brussels"/>;
  } catch {
    return ts ?? "—";
  }
}

function qsWith(
  base: Record<string, string>,
  patch: Record<string, string | null | undefined>
) {
  const sp = new URLSearchParams(base);
  Object.entries(patch).forEach(([k, v]) => {
    if (v == null) sp.delete(k);
    else sp.set(k, v);
  });
  return `?${sp.toString()}`;
}

function overdueThresholdHours(status: Status | null | undefined): number | null {
  switch (status) {
    case "new":
      return 48;
    case "reminder_1_dropoff":
    case "reminder_1_ship":
      return 96;
    case "reminder_2_dropoff":
    case "reminder_2_ship":
    case "reminder_3_dropoff":
    case "reminder_3_ship":
      return 144;
    default:
      return null;
  }
}

function isStatusOverdue(
  status: Status | null | undefined,
  createdAt?: string | null
): boolean {
  const threshold = overdueThresholdHours(status);
  if (!threshold || !createdAt) return false;

  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;

  const diffHours = (Date.now() - createdMs) / (1000 * 60 * 60);
  return diffHours >= threshold;
}

function hoursSinceCreated(createdAt?: string | null): number | null {
  if (!createdAt) return null;

  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return null;

  const diffHours = (Date.now() - createdMs) / (1000 * 60 * 60);
  if (!Number.isFinite(diffHours) || diffHours < 0) return null;

  return Math.floor(diffHours);
}

export default async function LeadsPage({
  searchParams: incomingSearchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccess('leads', false);
  const searchParams = await incomingSearchParams;

  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  if (!hasPermission(adminUser, "leads", "read")) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">
            Je hebt geen rechten om deze pagina te bekijken.
          </div>
          <p className="text-xs text-red-600 mt-1">
            Vraag een beheerder om je &quot;leads&quot;-rechten aan te passen in
            de settings &gt; Users.
          </p>
        </div>
      </div>
    );
  }

  const canReadLeads = hasPermission(adminUser, "leads", "read");
  const canWriteLeads = hasPermission(adminUser, "leads", "write");
  const canFinalizeLeads = hasPermission(adminUser, "leads_finalize", "write");

  if (!canReadLeads) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>
        <p className="text-sm text-gray-700">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  const q = (searchParams.q ?? "").trim();
  const from = (searchParams.from ?? "").trim();
  const to = (searchParams.to ?? "").trim();

  const order = (searchParams.order ?? "").trim();
  const customer = (searchParams.customer ?? "").trim();
  const modelF = (searchParams.model ?? "").trim();
  const variant = (searchParams.variant ?? "").trim();
  const statusF = (searchParams.status ?? "").trim();
  const method = (searchParams.method ?? "").trim() as "ship" | "dropoff" | "";
  const priceMin = (searchParams.price_min ?? "").trim();
  const priceMax = (searchParams.price_max ?? "").trim();
  const cityF = (searchParams.city ?? "").trim();
  const shop = (searchParams.shop ?? "").trim();
  const voucher = (searchParams.voucher ?? "").trim() as "yes" | "no" | "";

  const sort = searchParams.sort ?? "created_at";
  const dir = (searchParams.dir ?? "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50)
  );
  const offset = (page - 1) * limit;

  const defaultHideFinalStatuses = statusF === "";

  const { data: shopRows, error: shopsErr } = await supabaseAdmin
    .from("buyback_shops")
    .select("id,name,city")
    .order("name", { ascending: true });

  const shops = (shopRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    city: (s as any).city as string | null,
  }));

  const statusLabel = (s: Status | null | undefined) =>
    STATUS_OPTIONS.find((x) => x.value === s)?.label ?? "—";

  type Transition = {
    value: Status;
    label: string;
    ok: boolean;
    reason?: string;
  };

  function allowedTransitions(
    curr: Status | null | undefined,
    f: {
      customer_number?: string | null;
      sku?: string | null;
      imei_sn?: string | null;
      delivery_method?: "ship" | "dropoff" | null;
    }
  ): Transition[] {
    const hasCust = Boolean((f.customer_number ?? "").trim());
    const hasSKU = Boolean((f.sku ?? "").trim());
    const hasIMEI = Boolean((f.imei_sn ?? "").trim());
    const isDropoff = f.delivery_method === "dropoff";
    const isShip = f.delivery_method === "ship";

    switch (curr) {
      case "new": {
        const base: Transition[] = [
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

        if (isDropoff) {
          base.push(
            {
              value: "received_store",
              label: "Ontvangen in de winkel",
              ok: hasCust,
              reason: "Klantnummer vereist",
            },
            {
              value: "reminder_1_dropoff",
              label: "Reminder 1 Binnenbrengen",
              ok: hasCust,
              reason: "Klantnummer vereist",
            }
          );
        }

        if (isShip) {
          base.push({
            value: "label_created",
            label: "Verzendlabel aangemaakt",
            ok: hasCust,
            reason: "Klantnummer vereist",
          });
        }

        return base;
      }

      case "reminder_1_dropoff":
        return [
          {
            value: "reminder_2_dropoff",
            label: "Reminder 2 Binnenbrengen",
            ok: true,
          },
          {
            value: "received_store",
            label: "Ontvangen in de winkel",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "reminder_2_dropoff":
        return [
          {
            value: "reminder_3_dropoff",
            label: "Reminder 3 Binnenbrengen",
            ok: true,
          },
          {
            value: "received_store",
            label: "Ontvangen in de winkel",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "reminder_3_dropoff":
        return [
          {
            value: "received_store",
            label: "Ontvangen in de winkel",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "label_created":
        return [
          {
            value: "reminder_1_ship",
            label: "Reminder 1 Opzenden",
            ok: true,
          },
          {
            value: "shipment_received",
            label: "Zending ontvangen",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "reminder_1_ship":
        return [
          {
            value: "reminder_2_ship",
            label: "Reminder 2 Opzenden",
            ok: true,
          },
          {
            value: "shipment_received",
            label: "Zending ontvangen",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "reminder_2_ship":
        return [
          {
            value: "reminder_3_ship",
            label: "Reminder 3 Opzenden",
            ok: true,
          },
          {
            value: "shipment_received",
            label: "Zending ontvangen",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "reminder_3_ship":
        return [
          {
            value: "shipment_received",
            label: "Zending ontvangen",
            ok: true,
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "received_store":
      case "shipment_received":
        return [
          {
            value: "check_passed",
            label: "Controle succesvol",
            ok: hasSKU && hasIMEI,
            reason: "SKU + IMEI/SN vereist",
          },
          {
            value: "check_failed_technical",
            label: "Controle gefaald, technisch defect",
            ok: hasIMEI,
            reason: "IMEI/SN vereist",
          },
          {
            value: "check_failed_grading",
            label: "Controle gefaald, gradering",
            ok: hasIMEI,
            reason: "IMEI/SN vereist",
          },
        ];

      case "check_failed_technical":
      case "check_failed_grading":
        return [
          {
            value: "check_passed",
            label: "Controle succesvol",
            ok: hasSKU && hasIMEI,
            reason: "SKU + IMEI/SN vereist",
          },
          {
            value: "cancelled",
            label: "Geannuleerd",
            ok: true,
          },
        ];

      case "check_passed":
        return [
          {
            value: "done",
            label: "Afgewerkt",
            ok: true,
          },
        ];

      case "done":
      case "cancelled":
      default:
        return [];
    }
  }

  const effectiveFinalCents = (lead: Lead) => {
    if (lead.wants_voucher) {
      const v = lead.final_price_with_voucher_cents;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    const n = lead.final_price_cents;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  let query = supabaseAdmin
    .from("buyback_leads")
    .select(
      [
        "id",
        "order_code",
        "created_at",
        "model",
        "capacity_gb",
        "variant",
        "questions_answers_html",
        "base_price_cents",
        "final_price_cents",
        "final_price_with_voucher_cents",
        "first_name",
        "last_name",
        "email",
        "phone",
        "customer_number",
        "sku",
        "imei_sn",
        "battery_percentage",
        "used_parts_skus",
        "delivery_method",
        "shop_location",
        "street",
        "house_number",
        "postal_code",
        "city",
        "country",
        "iban",
        "status",
        "admin_note",
        "updated_at",
        "wants_voucher",
        "tracking_code",
        "tracking_url",
        "label_pdf_url",
        "cancel_reason",
        "status_history",
      ].join(","),
      { count: "exact" }
    );

  if (defaultHideFinalStatuses) {
    query = query.not("status", "in", "(done,cancelled)");
  }

  if (q) {
    query = query.or(
      [
        `order_code.ilike.%${q}%`,
        `model.ilike.%${q}%`,
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `city.ilike.%${q}%`,
        `shop_location.ilike.%${q}%`,
      ].join(",")
    );
  }

  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  if (order) query = query.ilike("order_code", `%${order}%`);
  if (customer) {
    query = query.or(
      [
        `first_name.ilike.%${customer}%`,
        `last_name.ilike.%${customer}%`,
        `email.ilike.%${customer}%`,
        `phone.ilike.%${customer}%`,
      ].join(",")
    );
  }
  if (modelF) query = query.ilike("model", `%${modelF}%`);
  if (variant) {
    const n = parseInt(variant, 10);
    if (!Number.isNaN(n)) query = query.eq("capacity_gb", n);
  }
  if (statusF) query = query.eq("status", statusF);
  if (method === "ship" || method === "dropoff")
    query = query.eq("delivery_method", method);

  if (priceMin) {
    const cents = Math.round(parseFloat(priceMin.replace(",", ".")) * 100);
    if (!Number.isNaN(cents)) {
      query = query.or(
        [
          `and(wants_voucher.eq.true,final_price_with_voucher_cents.gte.${cents})`,
          `and(or(wants_voucher.is.null,wants_voucher.eq.false),final_price_cents.gte.${cents})`,
        ].join(",")
      );
    }
  }
  if (priceMax) {
    const cents = Math.round(parseFloat(priceMax.replace(",", ".")) * 100);
    if (!Number.isNaN(cents)) {
      query = query.or(
        [
          `and(wants_voucher.eq.true,final_price_with_voucher_cents.lte.${cents})`,
          `and(or(wants_voucher.is.null,wants_voucher.eq.false),final_price_cents.lte.${cents})`,
        ].join(",")
      );
    }
  }

  if (cityF) query = query.ilike("city", `%${cityF}%`);
  if (shop) query = query.ilike("shop_location", `%${shop}%`);

  const sortable = new Set([
    "order_code",
    "created_at",
    "model",
    "capacity_gb",
    "final_price_cents",
    "status",
  ]);
  const sortCol = sortable.has(sort) ? sort : "created_at";
  query = query.order(sortCol as any, { ascending: dir === "asc" });

  query = query.range(offset, offset + limit - 1);

  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;
  try {
    const res = (await query) as unknown as {
      data: Lead[] | null;
      error: any;
      count: number | null;
    };
    data = res.data ?? [];
    error = res.error ?? null;
    count = res.count ?? 0;
  } catch (e: any) {
    error = e;
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <h1 className="text-2xl font-semibold mb-4">Leads</h1>
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">Fout bij laden</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {error?.message || JSON.stringify(error)}
          </pre>
        </div>
      </div>
    );
  }

  const labelReadiness = await getLeadLabelReadiness(data ?? []);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const qsBase: Record<string, string> = {};
  const kv: Record<string, string | undefined> = {
    q,
    from,
    to,
    order,
    customer,
    model: modelF,
    variant,
    status: statusF,
    method,
    price_min: priceMin,
    price_max: priceMax,
    city: cityF,
    shop,
    voucher,
    sort,
    dir,
    limit: String(limit),
  };
  Object.entries(kv).forEach(([k, v]) => {
    if (v && v !== "") qsBase[k] = v;
  });

  const hasActiveFilters = Object.keys(qsBase).some((k) =>
    [
      "q",
      "from",
      "to",
      "order",
      "customer",
      "model",
      "variant",
      "status",
      "method",
      "price_min",
      "price_max",
      "city",
      "shop",
      "voucher",
    ].includes(k)
  );

  const makeSortHref = (col: string) => {
    const sp = new URLSearchParams(qsBase);
    const nextDir = sort === col && dir === "asc" ? "desc" : "asc";
    sp.set("sort", col);
    sp.set("dir", nextDir);
    sp.set("page", "1");
    return `?${sp.toString()}`;
  };
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(qsBase);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };

  const inputCls = "bb-input h-…8073 tokens truncated…                href={labelHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center bb-btn h-7 px-2 text-[11px] font-medium"
                                  >
                                    Download label
                                  </a>
                                )}

                                {lead.delivery_method === "ship" &&
                                  [
                                    "label_created",
                                    "reminder_1_ship",
                                    "reminder_2_ship",
                                    "reminder_3_ship",
                                    "shipment_received",
                                  ].includes((lead.status ?? "") as Status) &&
                                  !lead.tracking_code &&
                                  !lead.tracking_url &&
                                  !lead.label_pdf_url && (
                                    <form
                                      action={resyncSendcloudLabelAction}
                                      className="inline-flex"
                                    >
                                      <input type="hidden" name="id" value={lead.id} />
                                      <button
                                        type="submit"
                                        className="inline-flex items-center bb-btn h-7 px-2 text-[11px] font-medium"
                                        title="Resync: label + tracking opslaan en mail opnieuw sturen"
                                        aria-label="Resync label"
                                      >
                                        🔄 Resync
                                      </button>
                                    </form>
                                  )}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}

            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Geen resultaten
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="leads-pagination">
        {page > 1 ? (
          <Link className="bb-btn h-8 text-xs px-3" href={pageHref(page - 1)}>
            ← Vorige
          </Link>
        ) : (
          <span className="bb-btn h-8 text-xs px-3" aria-disabled>
            ← Vorige
          </span>
        )}
        <span className="text-xs text-gray-600">
          Pagina {page} / {totalPages} • Totaal {total}
        </span>
        {page < totalPages ? (
          <Link className="bb-btn h-8 text-xs px-3" href={pageHref(page + 1)}>
            Volgende →
          </Link>
        ) : (
          <span className="bb-btn h-8 text-xs px-3" aria-disabled>
            Volgende →
          </span>
        )}
      </div>


    </div>
  );
}



