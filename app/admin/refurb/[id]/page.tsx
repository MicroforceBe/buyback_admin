// app/admin/refurb/[id]/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import RefurbReceptionTable from "../RefurbReceptionTable";
// ❌ getCurrentAdminUser veroorzaakt cookie-set tijdens render → runtime error
// import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  getRefurbStatusOptions,
  getRefurbLocationOptions,
  getRefurbStatusTransitions,
  type RefurbStatusOption,
  type RefurbLocationOption,
  type RefurbStatusTransitionsMap,
} from "../settingsActions";

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

  // Supabase geeft hier vaak een array terug voor de relatie.
  const raw = data as any;

  const supplierRel = Array.isArray(raw.supplier)
    ? raw.supplier[0] ?? null
    : raw.supplier ?? null;

  const supplier: SupplierInfo | null = supplierRel
    ? {
        id: String(supplierRel.id),
        name: String(supplierRel.name),
        vat_number:
          supplierRel.vat_number !== undefined && supplierRel.vat_number !== null
            ? String(supplierRel.vat_number)
            : null,
        contact_email:
          supplierRel.contact_email !== undefined &&
          supplierRel.contact_email !== null
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
      raw.internal_invoice_nr !== undefined && raw.internal_invoice_nr !== null
        ? String(raw.internal_invoice_nr)
        : null,
    supplier,
    rma_expiry_date:
      raw.rma_expiry_date !== undefined && raw.rma_expiry_date !== null
        ? String(raw.rma_expiry_date)
        : null,
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

/**
 * Bepaal model van een toestel:
 * - Alleen op basis van description.
 * - Als één van de comma-gescheiden search_keywords in description voorkomt,
 *   dan is het model = model.name.
 */
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

// ✅ robust: "ready_to_book" en "ready to book" gelijk trekken
function normStatusKey(s: string) {
  return norm(s).replace(/_/g, " ").replace(/\s+/g, " ").trim();
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
        <p className="text-sm text-red-600">
          Receptie niet gevonden (id: {params.id}).
        </p>
      </div>
    );
  }

  const [items, statusOptions, locationOptions, models, statusTransitions] = await Promise.all([
    getReceptionItems(reception.id),
    getRefurbStatusOptions(),
    getRefurbLocationOptions(),
    getRefurbModels(),
    getRefurbStatusTransitions(),
  ]);

  // ✅ Default location bepalen NA het ophalen van locationOptions
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

  // ✅ Default status + Ready to Book bepalen uit settings (robust, met fallback)
  const statusList = statusOptions || [];

  const defaultFromFlag =
    statusList.find((s: any) => s?.is_default === true) ||
    statusList.find((s: any) => s?.default === true) ||
    statusList.find((s: any) => s?.isDefault === true) ||
    null;

  const defaultStatusValue: string =
    (defaultFromFlag?.value as string) || (statusList[0]?.value as string) || "";

  const readyToBook =
    statusList.find((s) => normStatusKey((s as any).value) === "ready to book") ||
    statusList.find((s) => normStatusKey((s as any).label) === "ready to book") ||
    null;

  const readyToBookValue: string = (readyToBook?.value as string) || "";

  // -------- Status stats voor donut + percentages --------
  const totalItems = items.length;

  type StatusStat = {
    status: string;
    label: string;
    count: number;
    pct: number;
    color: string;
  };

  const statusOptionByValue = new Map<string, RefurbStatusOption>(
    (statusOptions || []).map((s) => [s.value, s])
  );
  const FALLBACK_STATUS_COLOR = "#64748b";
  const getStatusColor = (statusValue: string) =>
    statusOptionByValue.get(statusValue)?.color || FALLBACK_STATUS_COLOR;

  const statusCountMap = new Map<string, number>();
  for (const it of items) {
    const key = it.refurb_status || "onbekend";
    statusCountMap.set(key, (statusCountMap.get(key) ?? 0) + 1);
  }

  const statusStats: StatusStat[] = Array.from(statusCountMap.entries()).map(([status, count]) => {
    const def = statusOptionByValue.get(status);
    const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;

    const color = status === "onbekend" ? FALLBACK_STATUS_COLOR : getStatusColor(status);

    return {
      status,
      label: def?.label ?? status,
      count,
      pct,
      color,
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
      const statusKey = it.refurb_status || "onbekend";
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

  // ✅ FIX voor cookie runtime error:
  // getCurrentAdminUser() in deze server component kan cookies willen zetten → Next.js error.
  // Dus voorlopig: delete buttons uit (server-side delete blijft admin-only in de action).
  const canDelete = false;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Refurb reception {reception.reception_number}</h1>
          <p className="text-xs text-slate-500">
            Leverancier: <span className="font-medium">{supplierName}</span>
            {supplierVat && (
              <span className="ml-2 text-[11px] text-slate-500">(BTW: {supplierVat})</span>
            )}
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

      {/* Header / meta blok */}
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
          <div className="mt-0.5">
            {reception.internal_invoice_nr || <span className="text-slate-400">—</span>}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">RMA vervaldatum</div>
          <div className="mt-0.5">
            {reception.rma_expiry_date ? reception.rma_expiry_date : <span className="text-slate-400">—</span>}
          </div>
        </div>
      </div>

      {/* Status- & modeloverzicht */}
      <div className="border rounded-md bg-white p-3 text-xs">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          {/* Links: statusverdeling met donut */}
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">
              Statusverdeling in deze receptie
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-20 h-20 rounded-full border border-slate-200 flex items-center justify-center"
                style={donutStyle}
              >
                <div className="w-12 h-12 rounded-full bg-slate-50" />
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="text-slate-500">
                  Totaal:{" "}
                  <span className="font-semibold text-slate-700">{totalItems} toestellen</span>
                </div>
                {statusStats.map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate max-w-[140px]">{s.label}</span>
                    <span className="ml-auto tabular-nums">
                      {s.count} ({s.pct}%)
                    </span>
                  </div>
                ))}
                {statusStats.length === 0 && (
                  <div className="text-[11px] text-slate-400">Nog geen toestellen.</div>
                )}
              </div>
            </div>
          </div>

          {/* Rechts: aantal toestellen per model */}
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
                            style={{
                              width: `${pct}%`,
                              backgroundColor: s.color,
                            }}
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
      />
    </div>
  );
}
