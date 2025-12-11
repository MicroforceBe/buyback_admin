// app/admin/refurb/[id]/page.tsx
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
          supplierRel.vat_number !== undefined &&
          supplierRel.vat_number !== null
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
      raw.internal_invoice_nr !== undefined &&
      raw.internal_invoice_nr !== null
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

  const [items, statusOptions, locationOptions] = await Promise.all([
    getReceptionItems(reception.id),
    getRefurbStatusOptions(),
    getRefurbLocationOptions(),
  ]);

  const vatLabel =
    reception.vat_scheme === "margin" ? "Margin VAT" : "Normal VAT";

  const supplierName = reception.supplier?.name ?? "Onbekende leverancier";
  const supplierVat = reception.supplier?.vat_number ?? null;
  const supplierEmail = reception.supplier?.contact_email ?? null;

  // -------- Status stats voor donut + percentages --------
  const totalItems = items.length;

  type StatusStat = {
    status: string;
    label: string;
    count: number;
    pct: number;
    color: string;
  };

  const statusCountMap = new Map<string, number>();
  for (const it of items) {
    const key = it.refurb_status || "onbekend";
    statusCountMap.set(key, (statusCountMap.get(key) ?? 0) + 1);
  }

  const statusPalette = [
    "#0EA5E9", // sky
    "#22C55E", // green
    "#F97316", // orange
    "#EAB308", // yellow
    "#6366F1", // indigo
    "#EC4899", // pink
    "#64748B", // slate
  ];

  const statusStats: StatusStat[] = Array.from(statusCountMap.entries()).map(
    ([status, count], idx) => {
      const def = statusOptions.find((s) => s.value === status);
      const pct =
        totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
      return {
        status,
        label: def?.label ?? status,
        count,
        pct,
        color: statusPalette[idx % statusPalette.length],
      };
    }
  );

  // conic-gradient style voor donut
  let donutStyle: React.CSSProperties = {};
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

  // -------- Model stats (eenvoudig op basis van SKU/description gegroepeerd) --------
  type ModelStat = {
    key: string;
    name: string;
    count: number;
  };

  const modelCountMap = new Map<string, ModelStat>();
  for (const it of items) {
    const key =
      it.sku ??
      (it.description
        ? it.description.slice(0, 40)
        : "Onbekend model");
    const name = it.sku ?? it.description ?? "Onbekend model";

    const existing = modelCountMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      modelCountMap.set(key, { key, name, count: 1 });
    }
  }

  const modelStats = Array.from(modelCountMap.values()).sort(
    (a, b) => b.count - a.count
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
            {reception.rma_expiry_date ? (
              reception.rma_expiry_date
            ) : (
              <span className="text-slate-400">—</span>
            )}
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
              {/* Donut */}
              <div
                className="w-20 h-20 rounded-full border border-slate-200 flex items-center justify-center"
                style={donutStyle}
              >
                <div className="w-12 h-12 rounded-full bg-slate-50" />
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
                    <span className="truncate max-w-[140px]">
                      {s.label}
                    </span>
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

          {/* Rechts: aantal toestellen per model */}
          <div>
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
                    key={m.key}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate max-w-[200px]">
                      {m.name}
                    </span>
                    <span className="tabular-nums text-slate-700">
                      {m.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
