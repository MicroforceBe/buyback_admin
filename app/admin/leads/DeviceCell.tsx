// app/admin/leads/DeviceCell.tsx
"use client";

import { useEffect, useState } from "react";
import { updateLeadInlineAction } from "./actions";
import {
  searchErpArticlesForSku,
  type ErpSkuSearchResult,
} from "../refurb/actions";

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

function SkuAutocompleteInput({
  value,
  name,
  placeholder,
}: {
  value: string;
  name: string;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [results, setResults] = useState<ErpSkuSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const q = inputValue.trim();

      if (q.length < 2) {
        setResults([]);
        return;
      }

      try {
        setLoading(true);

        const rows = await searchErpArticlesForSku(q, "margin");

        if (!cancelled) {
          setResults(rows || []);
        }
      } catch (e) {
        console.error("[LEADS] SKU search error", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(run, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputValue]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          name={name}
          className={input}
          value={inputValue}
          placeholder={placeholder ?? "SKU"}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
          }}
        />

        <CopyBtn value={inputValue.trim()} title="Copy SKU" />
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 mt-1 w-[520px] overflow-hidden rounded-xl border bg-white shadow-2xl">
          {loading && (
            <div className="px-3 py-2 text-[11px] text-slate-500">
              Zoeken...
            </div>
          )}

          {!loading &&
            results.map((r) => (
              <button
                key={`${r.sku}-${r.title}`}
                type="button"
                className="flex w-full flex-col border-b px-3 py-2 text-left hover:bg-slate-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInputValue(r.sku);
                  setOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-[11px] text-slate-900">
                    {r.sku}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    Stock: {r.inventory_qty ?? 0}
                  </div>
                </div>

                <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                  {r.title || "—"}
                </div>

                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{((r.price_cents || 0) / 100).toFixed(2)}€</span>
                  <span>{r.vat_margin ? "Margin VAT" : "Normal VAT"}</span>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function DeviceCell(p: Props) {
  const [open, setOpen] = useState(false);

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
                    className="text-orange-500 ml-1 hidden"
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>

                <SkuAutocompleteInput
                  name="sku"
                  value={p.sku ?? ""}
                  placeholder="Zoek SKU..."
                />
              </div>

              <div className="flex flex-col">
                <label className={label}>
                  IMEI (15c) of Serienummer{" "}
                  <span
                    data-device-warning="imei_sn"
                    className="text-orange-500 ml-1 hidden"
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
                    className="text-orange-500 ml-1 hidden"
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
                    className="text-orange-500 ml-1 hidden"
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
