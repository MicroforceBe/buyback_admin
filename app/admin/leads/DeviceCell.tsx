// app/admin/leads/DeviceCell.tsx
"use client";

import { useEffect, useState } from "react";
import { updateLeadInlineAction, searchLeadSkuAction } from "./actions";
type ErpSkuSearchResult = Awaited<ReturnType<typeof searchLeadSkuAction>>[number];

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

type Props = {
  id: string;
  model: string | null;
  variant: string | null;
  capacity_gb: number | null;
  sku: string | null;
  imei_sn: string | null;
  questions_answers_html?: string | null;
  battery_percentage: number | null;
  used_parts_skus: string[] | null;
  status?: string | null;
  canEdit?: boolean;
};

const input = "bb-input h-9 text-xs px-2 py-1";
const label = "text-[11px] text-gray-500";

async function copyToClipboard(text: string) {
  try {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("[LEADS] clipboard error", e);
  }
}

function CopyBtn({ value, title }: { value: string; title?: string }) {
  return (
    <button
      type="button"
      className="bb-btn text-[11px] px-2 h-7"
      title={title ?? "Copy"}
      onClick={() => copyToClipboard(value)}
      disabled={!value}
    >
      ⧉
    </button>
  );
}

function SkuAutocompleteInput({ value, name, invalid }: {value: string; name: string; invalid: boolean}) {
  const [query, setQuery] = useState('');
  const [selectedSku, setSelectedSku] = useState(value);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [results, setResults] = useState<ErpSkuSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSelectedSku(value); setSelectedTitle(''); }, [value]);
  useEffect(() => {
    let cancelled = false;
    const search = query.trim();
    if (search.length < 2) { setResults([]); setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try { const rows = await searchLeadSkuAction(search); if (!cancelled) setResults(rows); }
      catch { if (!cancelled) { setResults([]); setError('Artikelen zoeken mislukt. Probeer opnieuw.'); } }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return <div className="relative space-y-1" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <div className="flex items-center gap-1">
      <input name={name} className={`${input} font-mono font-semibold tracking-wide`} value={selectedSku}
        onChange={event => { setSelectedSku(event.target.value); setSelectedTitle(''); setQuery(event.target.value); setOpen(true); }}
        onFocus={() => { setQuery(selectedSku); setOpen(true); }} autoComplete="off"
        aria-label="SKU of voorlopige omschrijving" aria-invalid={invalid} placeholder="SKU of omschrijving zoeken of invullen" />
      <CopyBtn value={selectedSku} title="Kopieer SKU" />
      {selectedSku && <button type="button" className="bb-btn text-xs px-2 h-7" title="SKU wissen" aria-label="SKU wissen"
        onClick={() => { setSelectedSku(''); setSelectedTitle(''); setQuery(''); setOpen(false); }}>×</button>}
    </div>
    {selectedTitle && <p className="text-[11px] text-slate-600">{selectedTitle}</p>}
    <p className="text-[11px] text-gray-500">Een omschrijving mag voorlopig. Voor ‘Controle succesvol’ is een bestaande ERP-SKU nodig.</p>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {open && query.trim().length >= 2 && <div className="absolute z-50 mt-1 w-full min-w-[280px] max-h-72 overflow-auto rounded-xl border bg-white shadow-2xl">
      {loading ? <p className="px-3 py-2 text-xs text-slate-500">Zoeken...</p> : results.length ? results.map(row =>
        <button key={row.sku} type="button" className="flex w-full flex-col border-b px-3 py-2 text-left hover:bg-slate-50"
          onMouseDown={event => event.preventDefault()} onClick={() => { setSelectedSku(row.sku); setSelectedTitle(row.title ?? ''); setOpen(false); setQuery(''); }}>
          <span className="font-mono text-xs font-semibold text-slate-900">{row.sku}</span>
          <span className="mt-1 text-[11px] text-slate-600">{row.title || '—'}</span>
          <span className="mt-1 text-[10px] text-slate-500">Voorraad: {row.inventory_qty ?? 0} · {((row.price_cents ?? 0)/100).toFixed(2)} €</span>
        </button>) : !error && <p className="px-3 py-2 text-xs text-slate-500">Geen artikelen gevonden.</p>}
    </div>}
  </div>;
}

export default function DeviceCell(p: Props) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{id: string; fields: string[]}>).detail;
      if (detail?.id !== p.id) return;
      setMissing(detail.fields);
      if (detail.fields.some(key => ['sku', 'imei_sn', 'battery_percentage', 'used_parts_skus'].includes(key))) setOpen(true);
    };
    window.addEventListener('lead-device-validation', show);
    return () => window.removeEventListener('lead-device-validation', show);
  }, [p.id]);

  const status: Status = (p.status ?? "new") as Status;
  const isEditable = !!p.canEdit;

  const afterShipment =
    status === "received_store" ||
    status === "shipment_received" ||
    status === "check_passed" ||
    status === "check_failed_technical" ||
    status === "check_failed_grading" ||
    status === "done" ||
    status === "cancelled";

  const initialParts = Array.isArray(p.used_parts_skus) ? p.used_parts_skus : [];

  const [parts, setParts] = useState<string[]>(
    initialParts.length ? initialParts : [""]
  );

  const modelLine =
    [
      p.model || undefined,
      p.variant || undefined,
      p.capacity_gb ? `${p.capacity_gb} GB` : undefined,
    ]
      .filter(Boolean)
      .join(" • ") || "—";

  const partsDisplay =
    parts
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{modelLine}</div>

          <div className="text-[11px] text-gray-500 truncate">
            {p.sku ? `SKU: ${p.sku}` : "SKU: —"}{" "}
            {p.imei_sn ? `• IMEI/SN: ${p.imei_sn}` : "• IMEI/SN: —"}
            {typeof p.battery_percentage === "number"
              ? ` • Batterij: ${p.battery_percentage}%`
              : ""}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
        >
          {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <>
          {!afterShipment ? (
            <div className="mt-1 text-[11px] text-gray-500">
              Eenmaal het toestel ontvangen is kan je details toevoegen.
            </div>
          ) : isEditable ? (
            <form
              action={updateLeadInlineAction}
              className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-2"
            >
              <input type="hidden" name="id" value={p.id} />

              <div className="flex flex-col">
                <label className={label}>
                  SKU{" "}
                  <span
                    data-device-warning="sku"
                    className={`text-red-700 ml-1 ${missing.includes("sku") ? "" : "hidden"}`}
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>

                <SkuAutocompleteInput
                  name="sku"
                  value={p.sku ?? ""}
                  invalid={missing.includes("sku")}
                />
              </div>

              <div className="flex flex-col">
                <label className={label}>
                  IMEI (15c) of Serienummer{" "}
                  <span
                    data-device-warning="imei_sn"
                    className={`text-red-700 ml-1 ${missing.includes("imei_sn") ? "" : "hidden"}`}
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>
                <input
                  name="imei_sn"
                  className={input}
                  defaultValue={p.imei_sn ?? ""}
                  placeholder="IMEI of SN"
                />
              </div>

              <div className="flex flex-col">
                <label className={label}>
                  Batterij (%){" "}
                  <span
                    data-device-warning="battery_percentage"
                    className={`text-red-700 ml-1 ${missing.includes("battery_percentage") ? "" : "hidden"}`}
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>
                <input
                  type="number"
                  name="battery_percentage"
                  className={input}
                  min={0}
                  max={100}
                  defaultValue={
                    typeof p.battery_percentage === "number"
                      ? p.battery_percentage
                      : ""
                  }
                  placeholder="0–100"
                />
              </div>

              <div className="flex flex-col mt-1">
                <label className={label}>
                  Gebruikte onderdelen (SKU&apos;s){" "}
                  <span
                    data-device-warning="used_parts_skus"
                    className={`text-red-700 ml-1 ${missing.includes("used_parts_skus") ? "" : "hidden"}`}
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>

                {parts.map((value, idx) => (
                  <div key={idx} className="mt-1 flex gap-2 items-center">
                    <input
                      className={input}
                      value={value}
                      placeholder={`Onderdeel SKU ${idx + 1}`}
                      onChange={(e) => {
                        const next = [...parts];
                        next[idx] = e.target.value;
                        setParts(next);
                      }}
                    />

                    {idx === parts.length - 1 && (
                      <button
                        type="button"
                        className="text-xs px-2 h-7 border rounded"
                        onClick={() => setParts([...parts, ""])}
                      >
                        +
                      </button>
                    )}
                  </div>
                ))}

                <input
                  type="hidden"
                  name="used_parts_skus"
                  value={parts
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(", ")}
                />
              </div>

              <div className="pt-1 flex items-center justify-between gap-2">
                <button className="bb-btn h-8 text-xs px-3" type="submit">
                  💾
                </button>
              </div>

              {p.questions_answers_html ? (
                <details className="mt-2 text-[11px] text-gray-700">
                  <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-900">
                    Vragen &amp; antwoorden tonen
                  </summary>
                  <div className="mt-1 border border-gray-200 rounded bg-white p-2 max-h-64 overflow-auto">
                    <div
                      className="prose prose-xs max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: p.questions_answers_html,
                      }}
                    />
                  </div>
                </details>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">
                  Geen vragen/antwoorden opgeslagen.
                </p>
              )}
            </form>
          ) : (
            <div className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-2 text-xs text-gray-700">
              <div>
                <span className="font-semibold">SKU:</span> {p.sku || "—"}
              </div>
              <div>
                <span className="font-semibold">IMEI/SN:</span>{" "}
                {p.imei_sn || "—"}
              </div>
              <div>
                <span className="font-semibold">Batterij:</span>{" "}
                {typeof p.battery_percentage === "number"
                  ? `${p.battery_percentage}%`
                  : "—"}
              </div>
              <div>
                <span className="font-semibold">Gebruikte onderdelen:</span>{" "}
                {partsDisplay}
              </div>

              {p.questions_answers_html ? (
                <details className="mt-2 text-[11px] text-gray-700">
                  <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-900">
                    Vragen &amp; antwoorden tonen
                  </summary>
                  <div className="mt-1 border border-gray-200 rounded bg-white p-2 max-h-64 overflow-auto">
                    <div
                      className="prose prose-xs max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: p.questions_answers_html,
                      }}
                    />
                  </div>
                </details>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">
                  Geen vragen/antwoorden opgeslagen.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

