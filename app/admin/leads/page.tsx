// app/admin/leads/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadInlineAction, deleteLeadAction } from "./actions";
import CustomerCell from "./CustomerCell";
import DeviceCell from "./DeviceCell";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// Eén centrale status-union die matcht met je DB
type Status =
  | "new"
  | "received_store"
  | "label_created"
  | "shipment_received"
  | "check_passed"
  | "check_failed"
  | "done"
  | "cancelled";

async function getLeads(): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin
    .from("buyback_leads")
    .select("*") // ← alles ophalen
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

  // NB: answers zit wél in de tabel, maar we selecteren het niet om lijstweergave licht te houden.
};

type SearchParams = {
  // globaal
  q?: string;
  from?: string;
  to?: string;

  // kolomfilters
  order?: string;
  customer?: string;
  model?: string;
  variant?: string; // capacity GB
  status?: string;
  method?: "ship" | "dropoff" | "";
  price_min?: string;
  price_max?: string;
  city?: string;
  shop?: string;
  voucher?: "yes" | "no" | "";

  // sort/paging
  sort?: string;
  dir?: "asc" | "desc";
  page?: string;
  limit?: string;
};

function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nl-BE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return ts ?? "—";
  }
}

// helper om QS te bouwen met overrides
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

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // 🔐 1) Haal de huidige admin user op
  const adminUser = await getCurrentAdminUser();

  // 🔐 2) Niet ingelogd → altijd naar login
  if (!adminUser) {
    redirect("/admin/login?reason=not_logged_in");
  }

  // 🔐 3) Ingelogd maar geen leesrecht op leads → toon nette fout
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

  // === permissions ===
  const canReadLeads = hasPermission(adminUser, "leads", "read");
  const canWriteLeads = hasPermission(adminUser, "leads", "write");
  // Extra recht om van 'Controle succesvol' naar 'Afgewerkt/Geannuleerd' te gaan
  const canFinalizeLeads = hasPermission(
    adminUser,
    "leads_finalize",
    "write"
  );

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

  // === params ===
  const q = (searchParams.q ?? "").trim();
  const from = (searchParams.from ?? "").trim();
  const to = (searchParams.to ?? "").trim();

  const order = (searchParams.order ?? "").trim();
  const customer = (searchParams.customer ?? "").trim();
  const modelF = (searchParams.model ?? "").trim();
  const variant = (searchParams.variant ?? "").trim();
  const statusF = (searchParams.status ?? "").trim();
  const method = (searchParams.method ?? "").trim() as
    | "ship"
    | "dropoff"
    | "";
  const priceMin = (searchParams.price_min ?? "").trim();
  const priceMax = (searchParams.price_max ?? "").trim();
  const cityF = (searchParams.city ?? "").trim();
  const shop = (searchParams.shop ?? "").trim();
  const voucher = (searchParams.voucher ?? "").trim() as
    | "yes"
    | "no"
    | "";

  const sort = searchParams.sort ?? "created_at";
  const dir = (searchParams.dir ?? "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(10, parseInt(searchParams.limit ?? "50", 10) || 50)
  );
  const offset = (page - 1) * limit;

  // === winkels ophalen voor de filter dropdown ===
  const { data: shopRows, error: shopsErr } = await supabaseAdmin
    .from("buyback_shops")
    .select("id,name,city")
    .order("name", { ascending: true });

  const shops = (shopRows ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    city: (s as any).city as string | null,
  }));

  const statusLabel = (s: Status | null | undefined) => {
    switch (s) {
      case "new":
        return "Nieuw";
      case "received_store":
        return "Ontvangen in winkel";
      case "label_created":
        return "Verzendlabel aangemaakt";
      case "shipment_received":
        return "Zending ontvangen";
      case "check_passed":
        return "Controle succesvol";
      case "check_failed":
        return "Controle gefaald";
      case "done":
        return "Afgewerkt";
      case "cancelled":
        return "Geannuleerd";
      default:
        return "—";
    }
  };

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
    }
  ): Transition[] {
    const hasCust = Boolean((f.customer_number ?? "").trim());
    const hasSKU = Boolean((f.sku ?? "").trim());
    const hasIMEI = Boolean((f.imei_sn ?? "").trim());

    switch (curr) {
      case "new":
        return [
          {
            value: "received_store",
            label: "Ontvangen in winkel",
            ok: hasCust,
            reason: "Klantnummer vereist",
          },
          {
            value: "label_created",
            label: "Verzendlabel aangemaakt",
            ok: hasCust,
            reason: "Klantnummer vereist",
          },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "received_store":
        return [
          {
            value: "check_passed",
            label: "Controle succesvol",
            ok: hasSKU && hasIMEI,
            reason: "SKU + IMEI/SN vereist",
          },
          {
            value: "check_failed",
            label: "Controle gefaald",
            ok: hasIMEI,
            reason: "IMEI/SN vereist",
          },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "label_created":
        return [
          {
            value: "shipment_received",
            label: "Zending ontvangen",
            ok: true,
          },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "shipment_received":
        return [
          {
            value: "check_passed",
            label: "Controle succesvol",
            ok: hasSKU && hasIMEI,
            reason: "SKU + IMEI/SN vereist",
          },
          {
            value: "check_failed",
            label: "Controle gefaald",
            ok: hasIMEI,
            reason: "IMEI/SN vereist",
          },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "check_failed":
        return [
          {
            value: "check_passed",
            label: "Controle succesvol",
            ok: hasSKU && hasIMEI,
            reason: "SKU + IMEI/SN vereist",
          },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "check_passed":
        return [
          { value: "done", label: "Afgewerkt", ok: true },
          { value: "cancelled", label: "Geannuleerd", ok: true },
        ];
      case "done":
      case "cancelled":
      default:
        return [];
    }
  }

  // === query ===
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
        // tracking
        "tracking_code",
        "tracking_url",
        "label_pdf_url",
        // annulatie
        "cancel_reason",
        // status history
        "status_history",
      ].join(","),
      { count: "exact" }
    );

  // Globale zoek
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

  // Datum range
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  // Kolomfilters
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
    if (!Number.isNaN(cents)) query = query.gte("final_price_cents", cents);
  }
  if (priceMax) {
    const cents = Math.round(parseFloat(priceMax.replace(",", ".")) * 100);
    if (!Number.isNaN(cents)) query = query.lte("final_price_cents", cents);
  }
  if (cityF) query = query.ilike("city", `%${cityF}%`);

  // Winkel-filter op basis van shop_location (waarde = winkelnaam uit dropdown)
  if (shop) query = query.ilike("shop_location", `%${shop}%`);

  // Voucher: (optioneel, niet geïmplementeerd voor performance)

  // sorteerbare kolommen
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

  // paginatie
  query = query.range(offset, offset + limit - 1);

  // execute
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

  const leadsForEdit = (data ?? []).map((l) => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    email: l.email,
    phone: l.phone,
    customer_number: l.customer_number,
    sku: l.sku,
    imei_sn: l.imei_sn,
    status: l.status as Status | null,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // base QS voor sort/paging behoud
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

  const inputCls = "bb-input h-9 text-xs px-2 py-1";
  const selectCls = "bb-select h-9 text-xs px-2 py-1";
  const btnCls = "bb-btn h-9 text-xs px-3";

  // Chips voor actieve filters
  const chipItems: { label: string; param: keyof SearchParams; value: string }[] =
    [];
  const pushChip = (
    label: string,
    param: keyof SearchParams,
    value?: string
  ) => {
    if (value && value !== "") chipItems.push({ label, param, value });
  };
  pushChip(`Zoek: ${q}`, "q", q);
  pushChip(`Van: ${from}`, "from", from);
  pushChip(`Tot: ${to}`, "to", to);
  pushChip(`Order: ${order}`, "order", order);
  pushChip(`Klant: ${customer}`, "customer", customer);
  pushChip(`Model: ${modelF}`, "model", modelF);
  pushChip(`GB: ${variant}`, "variant", variant);
  pushChip(`Status: ${statusF}`, "status", statusF);
  pushChip(`Methode: ${method}`, "method", method);
  pushChip(`€ min: ${priceMin}`, "price_min", priceMin);
  pushChip(`€ max: ${priceMax}`, "price_max", priceMax);
  pushChip(`Stad: ${cityF}`, "city", cityF);
  pushChip(`Winkel: ${shop}`, "shop", shop);
  pushChip(`Voucher: ${voucher}`, "voucher", voucher);

  const chip = (c: (typeof chipItems)[number]) => {
    const href = qsWith(qsBase, { [c.param]: null, page: "1" });
    return (
      <Link
        key={`${c.param}:${c.value}`}
        href={href}
        className="inline-flex items-center gap-1 text-xs px-2 h-6 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-200"
        title="Filter verwijderen"
      >
        <span className="font-medium">{c.label}</span>
        <span aria-hidden>❌</span>
      </Link>
    );
  };

  const resetHref = qsWith(qsBase, {
    q: null,
    from: null,
    to: null,
    order: null,
    customer: null,
    model: null,
    variant: null,
    status: null,
    method: null,
    price_min: null,
    price_max: null,
    city: null,
    shop: null,
    voucher: null,
    page: "1",
  });

  // helper: genereer fallback tracking-URL op basis van code
  const fallbackTrackingUrl = (code?: string | null) =>
    code
      ? `https://tracking.sendcloud.com/tracking/${encodeURIComponent(code)}`
      : null;

  return (
    <div className="w-full p-4 space-y-3">
      {/* Kop */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/admin" className={btnCls}>
          ← Terug
        </Link>
      </div>

      {/* Chips + togglebare filtersectie */}
      <div className="space-y-2">
        {/* Actieve filterchips */}
        {chipItems.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Actieve filters:</span>
            {chipItems.map(chip)}
            <Link
              href={resetHref}
              className="text-xs underline text-gray-600 hover:text-gray-900"
            >
              Alles wissen
            </Link>
          </div>
        )}

        <details
          className="border rounded-lg bg-white"
          {...(hasActiveFilters ? { open: true } : {})}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center gap-2">
            Filters{" "}
            {hasActiveFilters ? (
              <span className="text-xs text-gray-500">
                ({chipItems.length} actief)
              </span>
            ) : null}
          </summary>

          <form className="p-3 pt-0">
            {/* verstopte QS die we willen bewaren */}
            {Object.entries(qsBase).map(([k, v]) =>
              ![
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
                "limit",
                "page",
              ].includes(k) ? (
                <input key={k} type="hidden" name={k} value={v} />
              ) : null
            )}

            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              <input
                name="q"
                defaultValue={q}
                placeholder="Zoek overal…"
                className={inputCls}
              />
              <input
                type="date"
                name="from"
                defaultValue={from}
                className={inputCls}
              />
              <input
                type="date"
                name="to"
                defaultValue={to}
                className={inputCls}
              />

              <input
                name="order"
                defaultValue={order}
                placeholder="Order ID"
                className={inputCls}
              />
              <input
                name="customer"
                defaultValue={customer}
                placeholder="Klant (naam/email/tel)"
                className={inputCls}
              />
              <input
                name="model"
                defaultValue={modelF}
                placeholder="Model"
                className={inputCls}
              />
              <input
                name="variant"
                defaultValue={variant}
                placeholder="GB"
                className={inputCls}
              />

              <select
                name="status"
                defaultValue={statusF}
                className={selectCls}
              >
                <option value="">Status</option>
                <option value="new">Nieuw</option>
                <option value="received_store">Ontvangen in winkel</option>
                <option value="label_created">Verzendlabel aangemaakt</option>
                <option value="shipment_received">Zending ontvangen</option>
                <option value="check_passed">Controle succesvol</option>
                <option value="check_failed">Controle gefaald</option>
                <option value="done">Afgewerkt</option>
                <option value="cancelled">Geannuleerd</option>
              </select>

              <select
                name="method"
                defaultValue={method}
                className={selectCls}
              >
                <option value="">Methode</option>
                <option value="ship">Verzenden</option>
                <option value="dropoff">Binnenbrengen</option>
              </select>

              <input
                name="price_min"
                defaultValue={priceMin}
                placeholder="€ min"
                className={inputCls}
                inputMode="decimal"
              />
              <input
                name="price_max"
                defaultValue={priceMax}
                placeholder="€ max"
                className={inputCls}
                inputMode="decimal"
              />
              <input
                name="city"
                defaultValue={cityF}
                placeholder="Stad"
                className={inputCls}
              />

              {/* --- Winkel -> dropdown met winkels uit DB (waarde = naam) --- */}
              <select name="shop" defaultValue={shop} className={selectCls}>
                <option value="">
                  {shops.length
                    ? "Alle winkels"
                    : shopsErr
                    ? "Winkels niet geladen"
                    : "Winkels laden…"}
                </option>
                {shops.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.city ? `${s.name} (${s.city})` : s.name}
                  </option>
                ))}
              </select>

              <select
                name="voucher"
                defaultValue={voucher}
                className={selectCls}
              >
                <option value="">Voucher</option>
                <option value="yes">Ja</option>
                <option value="no">Nee/ontbreekt</option>
              </select>

              <select
                name="limit"
                defaultValue={String(limit)}
                className={selectCls}
              >
                <option value="25">25/p</option>
                <option value="50">50/p</option>
                <option value="100">100/p</option>
              </select>

              <div className="col-span-2 sm:col-span-1 flex gap-2">
                <button className={`${btnCls} primary`} type="submit">
                  Filter
                </button>
                <Link href={resetHref} className={`${btnCls} subtle`}>
                  Reset
                </Link>
              </div>
            </div>
          </form>
        </details>
      </div>

      {/* Tabel */}
      <div className="overflow-auto">
        <table className="w-full text-sm border border-gray-200">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[240px]">
                <a
                  href={makeSortHref("created_at")}
                  className="font-semibold hover:underline"
                >
                  Order ID
                </a>
                <div className="text-[11px] text-gray-500">
                  klik om orderdetails te tonen
                </div>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[120px]">
                <a
                  href={makeSortHref("created_at")}
                  className="font-semibold hover:underline"
                >
                  Datum
                </a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[240px]">
                <span className="font-semibold">Klant</span>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[240px]">
                <a
                  href={makeSortHref("model")}
                  className="font-semibold hover:underline"
                >
                  Model
                </a>
              </th>
              <th className="px-3 py-2 border-b border-r border-gray-200 w-[150px]">
                <a
                  href={makeSortHref("final_price_cents")}
                  className="font-semibold hover:underline"
                >
                  Prijs (€)
                </a>
              </th>
              <th className="px-3 py-2 border-b border-gray-200 w-[240px]">
                <span className="font-semibold">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((lead, idx) => (
              <tr
                key={lead.id}
                className={`border-t border-gray-200 ${
                  idx % 2 === 0 ? "bg-gray-50" : "bg-green-50"
                }`}
              >
                {/* Order ID + uitklap: orderdetails */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <details className="group">
                    <summary className="cursor-pointer flex items-center gap-2">
                      <span className="inline-block transition-transform group-open:-rotate-180">
                        ▾
                      </span>
                      <div>
                        <div className="font-mono">
                          {lead.order_code ?? "—"}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 whitespace-nowrap">
                          <span>
                            {lead.delivery_method === "ship"
                              ? "Verzenden"
                              : lead.delivery_method === "dropoff"
                              ? "Binnenbrengen"
                              : "—"}
                          </span>
                          <span aria-hidden>•</span>
                          {lead.wants_voucher ? (
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                              Voucher
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                              Overschrijving
                            </span>
                          )}
                        </div>
                      </div>
                    </summary>
                    <div className="mt-2 text-xs leading-5 space-y-1">
                      <div>
                        <span className="text-gray-500">Aangemaakt op: </span>
                        {fmtDate(lead.created_at)}
                      </div>

                      {/* STATUS LOG */}
                      {Array.isArray(lead.status_history) &&
                        lead.status_history.length > 0 && (
                          <div className="mt-1">
                            <div className="text-gray-500 mb-0.5">
                              Statuslog:
                            </div>
                            <ul className="space-y-0.5">
                              {lead.status_history
                                .filter((h) => h && h.type === "status")
                                .map((h, i) => (
                                  <li
                                    key={`${lead.id}-hist-${i}`}
                                    className="text-[11px] text-gray-700"
                                  >
                                    <span className="font-mono">
                                      {fmtDate(h.at ?? undefined)}
                                    </span>
                                    {h.by && (
                                      <>
                                        {" "}
                                        <span className="text-gray-500">•</span>{" "}
                                        <span>{h.by}</span>
                                      </>
                                    )}
                                    <span className="text-gray-500"> • </span>
                                    {/* Enkel de nieuwe status tonen */}
                                    <span>
                                      {statusLabel(h.to as Status | null)}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                      <div>
                        <span className="text-gray-500">
                          Laatst gewijzigd op:{" "}
                        </span>
                        {fmtDate(lead.updated_at)}
                      </div>
                      <div>
                        <span className="text-gray-500">Model: </span>
                        {lead.model ?? "—"}{" "}
                        {lead.capacity_gb ? `• ${lead.capacity_gb} GB` : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {lead.delivery_method === "dropoff"
                          ? `Winkel: ${lead.shop_location || "—"}`
                          : "Verzending"}
                      </div>
                      <div>
                        <span className="text-gray-500">Huidige status: </span>
                        {statusLabel(lead.status)}
                      </div>
                      {lead.status === "cancelled" && lead.cancel_reason && (
                        <div>
                          <span className="text-gray-500">
                            Reden annulatie:{" "}
                          </span>
                          {lead.cancel_reason}
                        </div>
                      )}
                    </div>
                  </details>
                </td>

                {/* Datum */}
                <td className="px-3 py-2 border-r border-gray-175 align-top">
                  {fmtDate(lead.created_at)}
                </td>

                {/* Klantnaam + uitklap met klantdetails */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <CustomerCell
                    id={lead.id}
                    customer_number={lead.customer_number}
                    iban={lead.iban}
                    last_name={lead.last_name}
                    first_name={lead.first_name}
                    street={lead.street}
                    house_number={lead.house_number}
                    postal_code={lead.postal_code}
                    city={lead.city}
                    country={lead.country}
                    phone={lead.phone}
                    email={lead.email}
                    // Na 'check_passed' geen edits meer mogelijk
                    canEdit={
                      canWriteLeads &&
                      lead.status !== "cancelled" &&
                      lead.status !== "check_passed" &&
                      lead.status !== "done"
                    }
                  />
                </td>

                {/* Model + device details */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  <DeviceCell
                    id={lead.id}
                    model={lead.model}
                    variant={lead.variant}
                    capacity_gb={lead.capacity_gb}
                    sku={lead.sku}
                    imei_sn={lead.imei_sn}
                    questions_answers_html={lead.questions_answers_html}
                    battery_percentage={lead.battery_percentage}
                    used_parts_skus={lead.used_parts_skus}
                    status={lead.status as Status | null}
                    canEdit={
                      canWriteLeads &&
                      lead.status !== "cancelled" &&
                      lead.status !== "check_passed" &&
                      lead.status !== "done"
                    }
                  />
                </td>

                {/* Prijs (inline editable / read-only) */}
                <td className="px-3 py-2 border-r border-gray-200 align-top">
                  {canWriteLeads &&
                  lead.status !== "cancelled" &&
                  lead.status !== "check_passed" ? (
                    <form
                      action={updateLeadInlineAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={lead.id} />
                      {/* hint voor logging prijswijziging */}
                      <input type="hidden" name="change_type" value="price" />
                      <input
                        type="hidden"
                        name="previous_final_price_cents"
                        value={lead.final_price_cents ?? ""}
                      />
                      <input
                        name="final_price_eur"
                        defaultValue={(
                          (lead.final_price_cents ?? 0) / 100
                        ).toString()}
                        className="bb-input h-9 text-xs px-2 py-1 w-24"
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                      <button
                        className="bb-btn subtle h-9 text-xs px-2"
                        type="submit"
                        title="Opslaan"
                      >
                        💾
                      </button>
                    </form>
                  ) : (
                    <div className="text-sm">
                      {lead.final_price_cents != null
                        ? (lead.final_price_cents / 100).toFixed(2)
                        : "—"}
                    </div>
                  )}
                </td>

                {/* Status (inline editable / read-only) + uitklap 'Verzending & label' */}
                <td className="px-3 py-2 align-top">
                  {(() => {
                    const curr = (lead.status ?? "new") as Status;

                    const isFinal =
                      curr === "done" || curr === "cancelled";
                    const trans = isFinal
                      ? []
                      : allowedTransitions(curr, {
                          customer_number: lead.customer_number,
                          sku: lead.sku,
                          imei_sn: lead.imei_sn,
                        }).filter((t) => t.ok);
                    const hasChoices = trans.length > 0;

                    const trackingHref =
                      lead.tracking_url ||
                      fallbackTrackingUrl(lead.tracking_code);
                    const hasTracking = Boolean(trackingHref);

                    // Download label URL:
                    let labelHref: string | null = null;
                    if (lead.label_pdf_url) {
                      if (/^https?:\/\//i.test(lead.label_pdf_url)) {
                        labelHref = lead.label_pdf_url;
                      } else {
                        labelHref = `/api/admin/sendcloud/label?parcel_id=${encodeURIComponent(
                          lead.label_pdf_url
                        )}`;
                      }
                    }

                    // basis: mag de user überhaupt status saven?
                    const canEditStatusBase =
                      canWriteLeads && !isFinal && hasChoices;

                    // extra: na 'check_passed' enkel finaliseren als hij dat recht heeft
                    const saveDisabled =
                      !canEditStatusBase ||
                      (curr === "check_passed" && !canFinalizeLeads);

                    return (
                      <div className="space-y-1">
                        {/* Bovenste deel: status / opslaan */}
                        {isFinal || !canWriteLeads ? (
                          <div className="text-sm font-medium text-gray-700">
                            {curr === "cancelled" ? (
                              <div className="space-y-0.5">
                                <div className="text-red-700 font-semibold">
                                  Geannuleerd
                                </div>
                                {lead.cancel_reason && (
                                  <div className="text-[11px] text-gray-600">
                                    Reden: {lead.cancel_reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              statusLabel(curr)
                            )}
                          </div>
                        ) : (
                          <form
                            action={updateLeadInlineAction}
                            className="space-y-1"
                            data-lead-id={lead.id}
                          >
                            <input
                              type="hidden"
                              name="id"
                              value={lead.id}
                            />
                            {/* hint voor logging statuswijziging */}
                            <input
                              type="hidden"
                              name="change_type"
                              value="status"
                            />
                            <input
                              type="hidden"
                              name="previous_status"
                              value={lead.status ?? ""}
                            />
                            <div className="inline-flex items-center gap-2">
                              <select
                                name="status"
                                defaultValue={curr}
                                className="bb-select-sm inline-block pr-8"
                                title={
                                  hasChoices
                                    ? "Status wijzigen"
                                    : "Geen vervolgstatus mogelijk"
                                }
                                disabled={!hasChoices}
                                data-status-select
                              >
                                <option value={curr}>
                                  {statusLabel(curr)}
                                </option>
                                {trans.map((t) => {
                                  const isFinalTarget =
                                    t.value === "done" ||
                                    t.value === "cancelled";
                                  const optionDisabled =
                                    curr === "check_passed" &&
                                    isFinalTarget &&
                                    !canFinalizeLeads;
                                  return (
                                    <option
                                      key={t.value}
                                      value={t.value}
                                      disabled={optionDisabled}
                                    >
                                      {t.label}
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                className="bb-btn subtle h-8 text-xs px-2"
                                type="submit"
                                disabled={saveDisabled}
                                title={
                                  saveDisabled
                                    ? "Geen geldige overgang"
                                    : "Opslaan"
                                }
                                aria-label="Opslaan"
                                data-save-button
                              >
                                💾
                              </button>
                            </div>

                            {/* Blok 'Reden annulatie' – alleen tonen bij keuze 'cancelled' (via JS) */}
                            <div
                              className="mt-1 text-[11px]"
                              data-cancel-block
                              style={{ display: "none" }}
                            >
                              <label className="flex flex-col gap-1">
                                <span className="text-xs text-gray-600">
                                  Reden annulatie
                                </span>
                                <select
                                  name="cancel_reason"
                                  defaultValue={lead.cancel_reason ?? ""}
                                  className="bb-select-sm inline-block pr-6"
                                  data-cancel-select
                                >
                                  <option value="">
                                    -- Kies reden --
                                  </option>
                                  <option value="Fake order">
                                    Fake order
                                  </option>
                                  <option value="Technische problemen met toestel">
                                    Technische problemen met toestel
                                  </option>
                                  <option value="Klant heeft zich bedacht">
                                    Klant heeft zich bedacht
                                  </option>
                                  <option value="Klant niet akkoord met nieuwe prijs">
                                    Klant niet akkoord met nieuwe prijs
                                  </option>
                                  <option value="Klant vindt dat het te lang duurt">
                                    Klant vindt dat het te lang duurt
                                  </option>
                                  <option value="Test Order">
                                    Test Order
                                  </option>
                                </select>
                              </label>
                            </div>
                          </form>
                        )}

                        {/* Uitklap: Verzending & label */}
                        <details className="mt-1 text-[11px]">
                          <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-900 flex items-center gap-1">
                            <span>▸</span>
                            <span>Verzending &amp; label</span>
                          </summary>

                          <div className="pl-4 mt-1 flex flex-col gap-1">
                            {/* Traceer pakket */}
                            {hasTracking ? (
                              <a
                                href={trackingHref!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center bb-btn h-7 px-2 text-[11px] font-medium"
                              >
                                Traceer pakket
                              </a>
                            ) : (
                              <span className="text-gray-400 italic">
                                Nog geen tracking beschikbaar
                              </span>
                            )}

                            {/* Download label */}
                            {labelHref && (
                              <a
                                href={labelHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center bb-btn h-7 px-2 text-[11px] font-medium"
                              >
                                Download label
                              </a>
                            )}
                          </div>
                        </details>
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}

            {(!data || data.length === 0) && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-gray-500"
                >
                  Geen resultaten
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      <div className="flex items-center justify-center gap-2">
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

      {/* Klein inline script: toont/hidet reden-blok, valideert verplichte velden bij controle en togglet save-knop bij 'cancelled' */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              function initForm(form) {
                if (!form) return;
                var statusSelect = form.querySelector('[data-status-select]');
                var cancelBlock = form.querySelector('[data-cancel-block]');
                var cancelSelect = form.querySelector('[data-cancel-select]');
                var saveBtn = form.querySelector('[data-save-button]');
                if (!statusSelect || !saveBtn || !cancelBlock) return;

                function sync() {
                  var status = statusSelect.value;
                  if (status === 'cancelled') {
                    cancelBlock.style.display = 'block';
                    if (cancelSelect) {
                      var hasReason = (cancelSelect.value || '').trim().length > 0;
                      // let de disabled-toestand door permissies bepalen *en* reden
                      if (saveBtn._disabledByPerm === true) {
                        saveBtn.disabled = true;
                      } else {
                        saveBtn.disabled = !hasReason;
                      }
                    } else {
                      saveBtn.disabled = true;
                    }
                  } else {
                    cancelBlock.style.display = 'none';
                    if (saveBtn._disabledByPerm === true) {
                      saveBtn.disabled = true;
                    } else {
                      saveBtn.disabled = false;
                    }
                  }
                }

                function validateDeviceFields() {
                  var status = statusSelect.value;
                  if (status !== 'check_passed' && status !== 'check_failed') return true;

                  var row = form.closest('tr');
                  if (!row) return true;

                  var requiredKeys = ['sku','imei_sn','battery_percentage','used_parts_skus'];
                  var ok = true;

                  requiredKeys.forEach(function(key) {
                    var warning = row.querySelector('[data-device-warning="' + key + '"]');
                    if (warning) warning.style.display = 'none';

                    var input;
                    if (key === 'used_parts_skus') {
                      input = row.querySelector('input[name="used_parts_skus"]');
                    } else if (key === 'battery_percentage') {
                      input = row.querySelector('input[name="battery_percentage"]');
                    } else {
                      input = row.querySelector('input[name="' + key + '"]');
                    }

                    var value = input && (input.value || '').trim();
                    if (!value) {
                      ok = false;
                      if (warning) warning.style.display = 'inline';
                    }
                  });

                  return ok;
                }

                // markeer initiële disabled (vb. door finalize-rechten) zodat sync() die respecteert
                if (saveBtn.disabled) {
                  saveBtn._disabledByPerm = true;
                }

                statusSelect.addEventListener('change', sync);
                if (cancelSelect) {
                  cancelSelect.addEventListener('change', sync);
                }

                form.addEventListener('submit', function(ev) {
                  if (!validateDeviceFields()) {
                    ev.preventDefault();
                  }
                });

                sync();
              }

              function initAll() {
                var forms = document.querySelectorAll('form[data-lead-id]');
                forms.forEach(initForm);
              }

              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initAll);
              } else {
                initAll();
              }
            })();
          `,
        }}
      />
    </div>
  );
}
