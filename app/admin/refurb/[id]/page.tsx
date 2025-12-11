// app/admin/refurb/[id]/page.tsx
import type { CSSProperties } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import RefurbReceptionTable from "../RefurbReceptionTable";
import {
  getRefurbStatusOptions,
  getRefurbLocationOptions,
  type RefurbStatusOption,
  type RefurbLocationOption,
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
  keywords: string[];
};

type StatusStat = {
  status: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

type ModelStat = {
  modelId: string | null;
  name: string;
  count: number;
};

const STATUS_COLORS: string[] = [
  "#0ea5e9", // sky
  "#22c55e", // green
  "#f97316", // orange
  "#a855f7", // purple
  "#eab308", // yellow
  "#ef4444", // red
  "#6366f1", // indigo
];

function colorForIndex(index: number): string {
  return STATUS_COLORS[index % STATUS_COLORS.length];
}

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
    rma_expiry_date:
      raw.rma_expiry_date !== undefined && raw.rma_expiry_date !== null
        ? String(raw.rma_expiry_date)
        : null,
    supplier,
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

  if (error || !data) {
    console.error("[REFURB] getRefurbModels error", error);
    return [];
  }

  return (data as any[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    keywords: String(row.search_keywords || "")
      .split(/[,;]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  }));
}

function inferModelForItem(
  item: RefurbItemRow,
  models: RefurbModel[]
): RefurbModel | null {
  const haystack = [
    item.sku,
    item.description,
    item.used_parts,
    item.refurb_diagnostics,
    item.supplier_device_errors,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const model of models) {
    if (model.keywords.some((kw) => kw && haystack.includes(kw))) {
      return model;
    }
  }
  return null;
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

  const [items, statusOptions, locationOptions, models] = await Promise.all([
    getReceptionItems(reception.id),
    getRefurbStatusOptions(),
    getRefurbLocationOptions(),
    getRefurbModels(),
  ]);

  const vatLabel =
    reception.vat_scheme === "margin" ? "Margin VAT" : "Normal VAT";

  const supplierName = reception.supplier?.name ?? "Onbekende leverancier";
  const supplierVat = reception.supplier?.vat_number ?? null;
  const supplierEmail = reception.supplier?.contact_email ?? null;

  const totalItems = items.length;

  // Status-statistieken
  const statusCountMap = new Map<string, number>();
  items.forEach((item) => {
    const key = item.refurb_status || "(geen status)";
    statusCountMap.set(key, (statusCountMap.get(key) || 0) + 1);
  });

  const statusStats: StatusStat[] = Array.from(statusCountMap.entries()).map(
    ([status, count], idx) => {
      const optLabel =
        statusOptions.find((o: RefurbStatusOption) => o.value === status)
          ?.label || status;
      const pct = totalItems ? Math.round((count / totalItems) * 100) : 0;
      return {
        status,
        label: optLabel,
        count,
        pct,
        color: colorForIndex(idx),
      };
    }
  );

  // Donut chart stijl
  let currentAngle = 0;
  const donutSegments: string[] = [];
  statusStats.forEach((s) => {
    const angle = (s.pct / 100) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    donutSegments.push(`${s.color} ${start}deg ${end}deg`);
    currentAngle = end;
  });

  const donutStyle: CSSProperties =
    statusStats.length > 0
      ? {
          backgroundImage: `conic-gradient(${donutSegments.join(", ")})`,
        }
      : {};

  // Model-statistieken
  const modelCountMap = new Map<string, number>();
  items.forEach((item) => {
    const m = inferModelForItem(item, models);
    const key = m?.id || "__unknown__";
    modelCountMap.set(key, (modelCountMap.get(key) || 0) + 1);
  });

  const modelStats: ModelStat[] = Array.from(modelCountMap.entries()).map(
    ([modelId, count]) => {
      const modelName =
        modelId === "__unknown__"
          ? "Onbekend model"
          : models.find((m) => m.id === modelId)?.name || "Onbekend model";
      return {
        modelId: modelId === "__unknown__" ? null : modelId,
        name: modelName,
        count,
      };
    }
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            Refurb reception {reception.reception_number}
          </h1>
          <p className="text-xs text-slate-500">
            Leverancier: <span className="font-medium">{supplierName}</span>
            {supplierVat && (
              <span className="ml-2 text-[11px] text-slate-500">
                (BTW: {supplierVat})
              </span>
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
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Receptie nr
          </div>
          <div className="mt-0.5">{reception.reception_number}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Datum
          </div>
          <div className="mt-0.5">{reception.reception_date}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Leverancier
          </div>
          <div className="mt-0.5">
            {supplierName}
            {supplierVat && (
              <span className="block text-[10px] text-slate-500">
                BTW: {supplierVat}
              </span>
            )}
            {supplierEmail && (
              <span className="block text-[10px] text-slate-500">
                {supplierEmail}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            BTW regeling
          </div>
          <div className="mt-0.5">{vatLabel}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Supplier invoice nr
          </div>
          <div className="mt-0.5">{reception.supplier_invoice_nr}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Intern factuurnr
          </div>
          <div className="mt-0.5">
            {reception.internal_invoice_nr || (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            RMA vervaldatum
          </div>
          <div className="mt-0.5">
            {reception.rma_expiry_date || (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase">
            Statusverdeling
          </div>
          <div className="mt-1 flex items-center gap-3">
            {/* Donut */}
            <div
              className="w-16 h-16 rounded-full border border-slate-200 flex items-center justify-center"
              style={donutStyle}
            >
              <div className="w-10 h-10 rounded-full bg-slate-50" />
            </div>

            {/* Legend */}
            <div className="space-y-1 text-[11px]">
              <div className="text-slate-500">
                Totaal:{" "}
                <span className="font-semibold text-slate-700">
                  {totalItems} toestellen
                </span>
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
                <div className="text-[11px] text-slate-400">
                  Nog geen toestellen.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modelverdeling */}
      <div className="border rounded-md bg-white p-3 text-xs">
        <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">
          Aantal toestellen per model
        </div>
        {modelStats.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            Geen toestellen of modellen konden niet worden bepaald.
          </div>
        ) : (
          <div className="space-y-1">
            {modelStats.map((m) => (
              <div
                key={m.modelId ?? "unknown"}
                className="flex items-center justify-between"
              >
                <span className="truncate max-w-[200px]">{m.name}</span>
                <span className="tabular-nums text-slate-700">
                  {m.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Excel-achtige tabel */}
      <RefurbReceptionTable
        receptionId={reception.id}
        initialItems={items}
        statusOptions={statusOptions}
        locationOptions={locationOptions}
      />
    </div>
  );
}
