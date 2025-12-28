// app/admin/refurb/[id]/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import RefurbReceptionTable from "../RefurbReceptionTable";
import {
  getRefurbStatusOptions,
  getRefurbLocationOptions,
  type RefurbStatusOption,
  type RefurbLocationOption,
} from "../settingsActions";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SupplierInfo = {
  id: string;
  name: string;
  vat_number: string | null;
  contact_email: string | null;
};

type RefurbReception = {
  id: string;
  reception_number: string;
  reception_date: string; // date als string
  vat_scheme: "margin" | "normal";
  supplier_invoice_nr: string;
  internal_invoice_nr: string | null;
  supplier: SupplierInfo | null;
  rma_expiry_date: string | null;
};

type RefurbItemRow = {
  id: string;
  reception_id: string;
  row_index: number;
  refurb_status: string;
  sku: string | null;
  used_parts: string | null;
  price_cents: number | null;
  description: string | null;
  supplier_device_errors: string | null;
  supplier_grading: string | null;
  refurb_diagnostics: string | null;
  rma_defect_description: string | null;
  rma: string | null;
  compensation_cents: number | null;

  // nieuwe kolommen
  imei_sn: string | null;
  manual_sn: string | null;
  location: string | null;
};

type RefurbModel = {
  id: string;
  name: string;
  search_keywords: string | null;
};

async function getReception(id: string): Promise<RefurbReception | null> {
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .select(
      `
      id,
      reception_number,
      reception_date,
      vat_scheme,
      supplier_invoice_nr,
      internal_invoice_nr,
      rma_expiry_date,
      supplier:supplier_id (
        id,
        name,
        vat_number,
        contact_email
      )
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("[REFURB] getReception error", error);
    return null;
  }

  const raw = data as any;

  const supplierRel = Array.isArray(raw.supplier) ? raw.supplier[0] ?? null : raw.supplier ?? null;

  const supplier: SupplierInfo | null = supplierRel
    ? {
        id: String(supplierRel.id),
        name: String(supplierRel.name),
        vat_number:
          supplierRel.vat_number !== undefined && supplierRel.vat_number !== null
            ? String(supplierRel.vat_number)
            : null,
        contact_email:
          supplierRel.contact_email !== undefined && supplierRel.contact_email !== null
            ? String(supplierRel.contact_email)
            : null,
      }
    : null;

  const reception: RefurbReception = {
    id: String(raw.id),
    reception_number: String(raw.reception_number),
    reception_date: String(raw.reception_date),
    vat_scheme: raw.vat_scheme === "normal" ? "normal" : "margin",
    supplier_invoice_nr: String(raw.supplier_invoice_nr),
    internal_invoice_nr:
      raw.internal_invoice_nr !== undefined && raw.internal_invoice_nr !== null ? String(raw.internal_invoice_nr) : null,
    supplier,
    rma_expiry_date:
      raw.rma_expiry_date !== undefined && raw.rma_expiry_date !== null ? String(raw.rma_expiry_date) : null,
  };

  return reception;
}

async function getReceptionItems(id: string): Promise<RefurbItemRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_reception_items")
    .select(
      `
      id,
      reception_id,
      row_index,
      refurb_status,
      sku,
      used_parts,
      price_cents,
      description,
      supplier_device_errors,
      supplier_grading,
      refurb_diagnostics,
      rma_defect_description,
      rma,
      compensation_cents,
      imei_sn,
      manual_sn,
      location
    `
    )
    .eq("reception_id", id)
    .order("row_index", { ascending: true });

  if (error) {
    console.error("[REFURB] getReceptionItems error", error);
    return [];
  }

  return data as RefurbItemRow[];
}

async function getRefurbModels(): Promise<RefurbModel[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_models")
    .select("id, name, search_keywords")
    .order("name", { ascending: true });

  if (error) {
    console.error("[REFURB] getRefurbModels error", error);
    return [];
  }

  return (data || []) as RefurbModel[];
}

function determineModelForItem(item: RefurbItemRow, models: RefurbModel[]): RefurbModel | null {
  if (!models.length) return null;

  const desc = (item.description || "").toLowerCase().trim();
  if (!desc) return null;

  for (const model of models) {
    const rawKeywords = (model.search_keywords || "").toLowerCase();
    if (!rawKeywords.trim()) continue;

    const tokens = rawKeywords
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!tokens.length) continue;

    const matches = tokens.some((token) => token && desc.includes(token));
    if (matches) return model;
  }

  return null;
}

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

/**
 * ✅ Canonicalize status in rows:
 * - If row has a label (e.g. "New") instead of value, map it to option.value.
 * - If unknown: keep as-is.
 */
function canonicalizeStatusValue(raw: string | null | undefined, statusOptions: RefurbStatusOption[]) {
  const v = (raw ?? "").trim();
  if (!v) return v;

  // exact match on value
  const byValue = statusOptions.find((o: any) => (o?.value ?? "").trim() === v);
  if (byValue) return byValue.value;

  // match on label (case-insensitive)
  const vNorm = norm(v);
  const byLabel = statusOptions.find((o: any) => norm(o?.label ?? "") === vNorm);
  if (byLabel) return byLabel.value;

  return v;
}

/**
 * ✅ Build transitions map using ID-based transitions table:
 * refurb_status_transitions(from_status_id, to_status_id)
 * refurb_status_options(id, value)
 *
 * Output: value -> [value...]
 */
async function buildStatusTransitionsMap(): Promise<Record<string, string[]>> {
  const [{ data: options, error: e1 }, { data: transitions, error: e2 }] = await Promise.all([
    supabaseAdmin.from("refurb_status_options").select("id, value"),
    supabaseAdmin.from("refurb_status_transitions").select("from_status_id, to_status_id"),
  ]);

  if (e1) {
    console.error("[REFURB] buildStatusTransitionsMap options error", e1);
    return {};
  }
  if (e2) {
    console.error("[REFURB] buildStatusTransitionsMap transitions error", e2);
    return {};
  }

  const idToValue = new Map<string, string>();
  for (const row of (options || []) as any[]) {
    if (!row?.id || !row?.value) continue;
    idToValue.set(String(row.id), String(row.value));
  }

  const map: Record<string, string[]> = {};

  for (const tr of (transitions || []) as any[]) {
    const fromId = String(tr.from_status_id ?? "");
    const toId = String(tr.to_status_id ?? "");
    const fromValue = idToValue.get(fromId);
    const toValue = idToValue.get(toId);
    if (!fromValue || !toValue) continue;

    if (!map[fromValue]) map[fromValue] = [];
    map[fromValue].push(toValue);
  }

  // de-dup
  for (const k of Object.keys(map)) {
    map[k] = Array.from(new Set(map[k]));
  }

  return map;
}

function moneyEUR(cents: number) {
  return (cents / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default async function RefurbReceptionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const reception = await getReception(params.id);

  if (!reception) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">Refurb reception</h1>
        <p className="text-sm text-red-600">Receptie niet gevonden (id: {params.id}).</p>
      </div>
    );
  }

  const user = await getCurrentAdminUser();
  const canUseAdminStatuses = Boolean(user && user.role === "admin");

  const [itemsRaw, statusOptions, locationOptions, models, statusTransitions] = await Promise.all([
    getReceptionItems(reception.id),
    getRefurbStatusOptions(),
    getRefurbLocationOptions(),
    getRefurbModels(),
    buildStatusTransitionsMap(),
  ]);

  // ✅ Canonicalize status values in the loaded items (fix label-vs-value historical data)
  const items = (itemsRaw || []).map((it) => ({
    ...it,
    refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || []),
  }));

  const locationList = locationOptions || [];

  const defaultLocFromFlag =
    locationList.find((l: any) => l?.is_default === true) ||
    locationList.find((l: any) => l?.default === true) ||
    locationList.find((l: any) => l?.isDefault === true) ||
    null;

  const defaultLocationValue: string =
    (defaultLocFromFlag?.value as string) || (locationList[0]?.value as string) || "";

  const vatLabel = reception.vat_scheme === "margin" ? "Margin VAT" : "Normal VAT";

  const supplierName = reception.supplier?.name ?? "Onbekende leverancier";
  const supplierVat = reception.supplier?.vat_number ?? null;
  const supplierEmail = reception.supplier?.contact_email ?? null;

  const statusList = statusOptions || [];

  const defaultFromFlag =
    statusList.find((s: any) => s?.is_default === true) ||
    statusList.find((s: any) => s?.default === true) ||
    statusList.find((s: any) => s?.isDefault === true) ||
    null;

  const defaultStatusValue: string =
    (defaultFromFlag?.value as string) || (statusList[0]?.value as string) || "";

  const readyToBook =
    statusList.find((s) => norm((s as any).value) === "ready to book") ||
    statusList.find((s) => norm((s as any).label) === "ready to book") ||
    null;

  const readyToBookValue: string = (readyToBook?.value as string) || "";

  // -------- Status stats voor donut + percentages + values --------
  const totalItems = items.length;

  const statusOptionByValue = new Map<string, RefurbStatusOption>((statusOptions || []).map((s) => [s.value, s]));
  const FALLBACK_STATUS_COLOR = "#64748b";
  const getStatusColor = (statusValue: string) => statusOptionByValue.get(statusValue)?.color || FALLBACK_STATUS_COLOR;

  const statusCountMap = new Map<string, number>();
  const statusValueMap = new Map<string, number>(); // cents

  for (const it of items) {
    const key = (it.refurb_status || "onbekend").trim() || "onbekend";
    statusCountMap.set(key, (statusCountMap.get(key) ?? 0) + 1);

    const pc = typeof (it as any).price_cents === "number" ? Number((it as any).price_cents) : 0;
    statusValueMap.set(key, (statusValueMap.get(key) ?? 0) + (Number.isFinite(pc) ? pc : 0));
  }

  type StatusStat = {
    status: string;
    label: string;
    count: number;
    pct: number;
    color: string;
    value_cents: number;
  };

  const statusStats: StatusStat[] = Array.from(statusCountMap.entries()).map(([status, count]) => {
    const def = statusOptionByValue.get(status);
    const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;

    const color = status === "onbekend" ? FALLBACK_STATUS_COLOR : getStatusColor(status);
    const value_cents = statusValueMap.get(status) ?? 0;

    return {
      status,
      label: def?.label ?? status,
      count,
      pct,
      color,
      value_cents,
    };
  });

  let donutStyle: Record<string, string> = {};
  if (totalItems > 0 && statusStats.length > 0) {
    let currentAngle = 0;
    const segments: string[] = [];
    for (const s of statusStats) {
      const start = currentAngle;
      const angle = (s.count / totalItems) * 360;
      const end = start + angle;
      segments.push(`${s.color} ${start}deg ${end}deg`);
      currentAngle = end;
    }
    donutStyle = {
      backgroundImage: `conic-gradient(${segments.join(", ")})`,
    };
  }

  // -------- Final vs Not Done totals --------
  const isFinalStatus = (statusValue: string) => {
    const v = (statusValue || "").trim();
    if (!v) return false;
    if (v === "onbekend") return false;
    const next = (statusTransitions || {})[v] || [];
    return !next || next.length === 0;
  };

  const totalValueAllCents = items.reduce((acc, it) => {
    const pc = typeof (it as any).price_cents === "number" ? Number((it as any).price_cents) : 0;
    return acc + (Number.isFinite(pc) ? pc : 0);
  }, 0);

  const totalValueDoneCents = items.reduce((acc, it) => {
    const st = (it.refurb_status || "onbekend").trim() || "onbekend";
    if (!isFinalStatus(st)) return acc;
    const pc = typeof (it as any).price_cents === "number" ? Number((it as any).price_cents) : 0;
    return acc + (Number.isFinite(pc) ? pc : 0);
  }, 0);

  const totalValueNotDoneCents = totalValueAllCents - totalValueDoneCents;

  // -------- Model stats --------
  type ModelStat = {
    modelId: string;
    name: string;
    total: number;
    perStatus: { [status: string]: number };
  };

  const modelStatsMap = new Map<string, ModelStat>();

  for (const m of models) {
    modelStatsMap.set(m.id, {
      modelId: m.id,
      name: m.name,
      total: 0,
      perStatus: {},
    });
  }

  let unknownCount = 0;

  for (const it of items) {
    const matchedModel = determineModelForItem(it, models);
    if (matchedModel) {
      const statusKey = (it.refurb_status || "onbekend").trim() || "onbekend";
      const existing = modelStatsMap.get(matchedModel.id);
      if (existing) {
        existing.total += 1;
        existing.perStatus[statusKey] = (existing.perStatus[statusKey] ?? 0) + 1;
      } else {
        modelStatsMap.set(matchedModel.id, {
          modelId: matchedModel.id,
          name: matchedModel.name,
          total: 1,
          perStatus: { [statusKey]: 1 },
        });
      }
    } else {
      unknownCount += 1;
    }
  }

  const modelStats = Array.from(modelStatsMap.values())
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  // ✅ Je had dit bewust hardcoded gezet om cookie issues te vermijden.
  // Server actions blijven sowieso admin valideren.
  const canDelete = true;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Refurb reception {reception.reception_number}</h1>
          <p className="text-xs text-slate-500">
            Leverancier: <span className="font-medium">{supplierName}</span>
            {supplierVat && <span className="ml-2 text-[11px] text-slate-500">(BTW: {supplierVat})</span>}
          </p>
          {supplierEmail && (
            <p className="text-[11px] text-slate-500">
              Contact:{" "}
              <a href={`mailto:${supplierEmail}`} className="underline">
                {supplierEmail}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 text-xs bg-slate-50 border rounded-md p-3 md:grid-cols-3">
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">Receptie nr</div>
          <div className="mt-0.5">{reception.reception_number}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">Datum</div>
          <div className="mt-0.5">{reception.reception_date}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">Leverancier</div>
          <div className="mt-0.5">
            {supplierName}
            {supplierVat && <span className="block text-[10px] text-slate-500">BTW: {supplierVat}</span>}
            {supplierEmail && <span className="block text-[10px] text-slate-500">{supplierEmail}</span>}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">BTW regeling</div>
          <div className="mt-0.5">{vatLabel}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">Supplier invoice nr</div>
          <div className="mt-0.5">{reception.supplier_invoice_nr}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">Intern factuurnr</div>
          <div className="mt-0.5">{reception.internal_invoice_nr || <span className="text-slate-400">—</span>}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">RMA vervaldatum</div>
          <div className="mt-0.5">
            {reception.rma_expiry_date ? reception.rma_expiry_date : <span className="text-slate-400">—</span>}
          </div>
        </div>
      </div>

      {/* ✅ ENKEL 1 statusblok: uitklapbaar (standaard dicht) met donut + legenda + waardes + modellen */}
<details className="border rounded-md bg-white text-xs group">
  <summary className="cursor-pointer select-none px-3 py-2 border-b bg-slate-50 flex items-center justify-between">
    <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">
      Status verdeling in deze receptie
    </div>
    <div className="text-[11px] text-slate-600 transition-transform group-open:rotate-180">
      ▼
    </div>
  </summary>

  <div className="p-3">
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
      <div>
        <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">
          Statusverdeling in deze receptie
        </div>

        {/* donut + legenda */}
        <div className="flex items-start gap-4">
          {/* ✅ donut blijft rond */}
          <div
            className="shrink-0 w-20 h-20 min-w-[80px] min-h-[80px] aspect-square rounded-full border border-slate-200 flex items-center justify-center"
            style={donutStyle}
          >
            <div className="w-12 h-12 aspect-square rounded-full bg-slate-50" />
          </div>

          {/* ✅ legenda met nette kolommen */}
          <div className="space-y-2 text-[11px] w-full">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="text-slate-500">
                Totaal:{" "}
                <span className="font-semibold text-slate-700">{totalItems} toestellen</span>
              </div>
              <div className="text-right tabular-nums text-slate-600">{moneyEUR(totalValueAllCents)}</div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="text-slate-500">
                Niet afgewerkt:{" "}
                <span className="font-semibold text-slate-700">{moneyEUR(totalValueNotDoneCents)}</span>
              </div>
              <div />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="text-slate-500">
                Afgewerkt:{" "}
                <span className="font-semibold text-slate-700">{moneyEUR(totalValueDoneCents)}</span>
              </div>
              <div />
            </div>

            <div className="pt-1 border-t" />

            {/* header row */}
            <div className="grid grid-cols-[14px_minmax(0,1fr)_auto_auto] gap-2 text-[10px] uppercase text-slate-400">
              <div />
              <div>Status</div>
              <div className="text-right">Aantal</div>
              <div className="text-right">Waarde</div>
            </div>

            {statusStats.map((s) => (
              <div key={s.status} className="grid grid-cols-[14px_minmax(0,1fr)_auto_auto] gap-2 items-center">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="tabular-nums text-right text-slate-700">
                  {s.count} ({s.pct}%)
                </span>
                <span className="tabular-nums text-right text-slate-600">
                  {moneyEUR(s.value_cents)}
                </span>
              </div>
            ))}

            {statusStats.length === 0 && (
              <div className="text-[11px] text-slate-400">Nog geen toestellen.</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">
          Aantal toestellen per model
        </div>
        {modelStats.length === 0 && unknownCount === 0 ? (
          <div className="text-[11px] text-slate-500">
            Geen toestellen of modellen konden niet worden bepaald.
          </div>
        ) : (
          <div className="space-y-2">
            {modelStats.map((m) => (
              <div key={m.modelId} className="flex items-center gap-2">
                <span className="truncate text-right w-32 shrink-0">{m.name}</span>

                <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden flex">
                  {statusStats.map((s) => {
                    const count = m.perStatus[s.status] ?? 0;
                    if (!count) return null;

                    const pct = m.total > 0 ? (count / m.total) * 100 : 0;

                    return (
                      <div
                        key={s.status}
                        className="h-full flex items-center justify-center text-[9px] text-white"
                        style={{ width: `${pct}%`, backgroundColor: s.color }}
                        title={`${s.label}: ${count}`}
                      >
                        {count}
                      </div>
                    );
                  })}
                </div>

                <span className="tabular-nums text-slate-700 w-6 text-right">{m.total}</span>
              </div>
            ))}

            {unknownCount > 0 && (
              <div className="flex items-center justify-between text-slate-500">
                <span className="truncate max-w-[200px]">Onbekend model</span>
                <span className="tabular-nums">{unknownCount}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
</details>


      <RefurbReceptionTable
        receptionId={reception.id}
        initialItems={items as any}
        statusOptions={statusOptions}
        locationOptions={locationOptions}
        defaultStatusValue={defaultStatusValue}
        readyToBookValue={readyToBookValue}
        defaultLocationValue={defaultLocationValue}
        statusTransitions={statusTransitions}
        canDelete={canDelete}
        canUseAdminStatuses={canUseAdminStatuses}
      />
    </div>
  );
}
