// app/admin/refurb/RefurbReceptionTable.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefurbItem,
  updateRefurbItemCell,
  pasteIntoRefurbColumn,
} from "./actions";
import type {
  RefurbStatusOption,
  RefurbLocationOption,
} from "./settingsActions";

type Props = {
  receptionId: string;
  initialItems: RefurbItem[];
  statusOptions: RefurbStatusOption[];
  locationOptions: RefurbLocationOption[];
};

const LOCK_AFTER_FILL_FIELDS = new Set<
  | "sku"
  | "used_parts"
  | "price_cents"
  | "description"
  | "supplier_device_errors"
  | "supplier_grading"
>([
  "sku",
  "used_parts",
  "price_cents",
  "description",
  "supplier_device_errors",
  "supplier_grading",
]);

function money(cents: number | null) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

// eenvoudige client-side parse naar cents (zelfde idee als server)
function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

// status + location + IMEI/SN + SKU + used + price + desc + supp remarks + supp grading
const BASE_COL_COUNT = 9;
const EXTRA_SN_COL_COUNT = 1; // optionele SN kolom
const ADVANCED_COL_COUNT = 4; // refurb diagnostics + rma defect + rma + compensation

function parseUsedParts(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

type UsedPartsCellProps = {
  rawValue: string | null;
  locked: boolean;
  onChange: (raw: string) => void;
  onPasteToColumn?: (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
};

function UsedPartsCell({
  rawValue,
  locked,
  onChange,
  onPasteToColumn,
}: UsedPartsCellProps) {
  const [parts, setParts] = useState<string[]>(() => parseUsedParts(rawValue));

  useEffect(() => {
    setParts(parseUsedParts(rawValue));
  }, [rawValue]);

  if (locked) {
    return (
      <span
        className="block truncate max-w-[200px]"
        title={rawValue ?? ""}
      >
        {rawValue}
      </span>
    );
  }

  const commit = () => {
    const raw = parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ");
    onChange(raw);
  };

  const updatePart = (index: number, value: string) => {
    setParts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addPart = () => {
    setParts((prev) => [...prev, ""]);
  };

  const removePart = (index: number) => {
    setParts((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      const raw = next
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ");
      onChange(raw);
      return next;
    });
  };

  const rows = parts.length > 0 ? parts : [""];

  return (
    <div className="flex flex-col gap-1">
      {rows.map((part, i) => (
        <div key={i} className="flex gap-1">
          <input
            className="bb-input h-7 text-[11px] px-1 w-full"
            value={part}
            onChange={(e) => updatePart(i, e.target.value)}
            onBlur={commit}
            onPaste={
              i === 0 && onPasteToColumn
                ? (e) => onPasteToColumn(e)
                : undefined
            }
          />
          {rows.length > 1 && (
            <button
              type="button"
              className="bb-btn text-[11px] px-2"
              onClick={() => removePart(i)}
            >
              –
            </button>
          )}
          {i === rows.length - 1 && (
            <button
              type="button"
              className="bb-btn text-[11px] px-2"
              onClick={addPart}
            >
              +
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RefurbReceptionTable({
  receptionId,
  initialItems,
  statusOptions,
  locationOptions,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RefurbItem[]>(initialItems);
  const [isPasting, setIsPasting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExtraSn, setShowExtraSn] = useState(false);

  const hasItems = items.length > 0;
  const colSpan =
    BASE_COL_COUNT +
    (showExtraSn ? EXTRA_SN_COL_COUNT : 0) +
    (showAdvanced ? ADVANCED_COL_COUNT : 0);

  async function handleCellChange(
    itemId: string,
    field:
      | "refurb_status"
      | "sku"
      | "used_parts"
      | "price_cents"
      | "description"
      | "supplier_device_errors"
      | "supplier_grading"
      | "refurb_diagnostics"
      | "rma_defect_description"
      | "rma"
      | "compensation_cents"
      | "imei_sn"
      | "manual_sn"
      | "location",
    value: string
  ) {
    // optimistic update
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        if (field === "price_cents" || field === "compensation_cents") {
          return {
            ...it,
            [field]: value ? parseMoneyToCents(value) : null,
          } as RefurbItem;
        }

        return {
          ...it,
          [field]: value || null,
        } as RefurbItem;
      })
    );

    try {
      await updateRefurbItemCell(itemId, field as any, value);

      // status/location aangepast → herbereken header (grafieken, tellingen)
      if (field === "refurb_status" || field === "location") {
        router.refresh();
      }
    } catch (e) {
      console.error("[REFURB] updateCell client error", e);
    }
  }

  async function handlePasteToColumn(
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    startRowIndex: number,
    field:
      | "refurb_status"
      | "sku"
      | "used_parts"
      | "price_cents"
      | "description"
      | "supplier_device_errors"
      | "supplier_grading"
      | "refurb_diagnostics"
      | "rma_defect_description"
      | "rma"
      | "compensation_cents"
      | "imei_sn"
      | "manual_sn"
      | "location"
  ) {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\n")) {
      return; // enkele waarde → default gedrag
    }

    e.preventDefault();
    const lines = text.split(/\r?\n/);

    try {
      setIsPasting(true);
      const updated = await pasteIntoRefurbColumn(
        receptionId,
        startRowIndex,
        field as any,
        lines
      );
      setItems(updated);
      // receptie refreshen zodat header + grafieken up-to-date zijn
      router.refresh();
    } catch (err) {
      console.error("[REFURB] pasteToColumn client error", err);
    } finally {
      setIsPasting(false);
    }
  }

  function isLockedSupplierCell(
    item: RefurbItem,
    field:
      | "sku"
      | "used_parts"
      | "price_cents"
      | "description"
      | "supplier_device_errors"
      | "supplier_grading"
  ) {
    if (!LOCK_AFTER_FILL_FIELDS.has(field)) return false;

    const value = (item as any)[field];
    if (field === "price_cents") {
      return value !== null && value !== undefined;
    }
    return value !== null && value !== undefined && value !== "";
  }

  return (
    <div className="border rounded-md overflow-x-auto text-xs mt-4">
      <div className="flex items-center justify-between px-2 py-1 border-b bg-slate-50">
        <span className="font-medium text-[11px] uppercase tracking-wide">
          Refurb Reception items
        </span>
        <div className="flex items-center gap-3">
          {isPasting && (
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span
                className="inline-flex w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin"
                aria-hidden="true"
              />
              <span>Bezig met plakken...</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowExtraSn((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
          >
            <span
              className="inline-flex items-center justify-center w-4 h-4 border rounded-full"
              aria-hidden="true"
            >
              {showExtraSn ? "▲" : "▼"}
            </span>
            <span>Extra SN</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
          >
            <span
              className="inline-flex items-center justify-center w-4 h-4 border rounded-full"
              aria-hidden="true"
            >
              {showAdvanced ? "▲" : "▼"}
            </span>
            <span>RMA</span>
          </button>
        </div>
      </div>
      <table className="min-w-full border-collapse">
        <thead className="bg-slate-50 text-[11px] uppercase">
          <tr>
            <th className="px-2 py-1 border">Status</th>
            <th className="px-2 py-1 border">Location</th>
            <th className="px-2 py-1 border">IMEI/SN</th>
            {showExtraSn && <th className="px-2 py-1 border">SN</th>}
            <th className="px-2 py-1 border">SKU</th>
            <th className="px-2 py-1 border">Used parts</th>
            <th className="px-2 py-1 border">Price</th>
            <th className="px-2 py-1 border">Description</th>
            <th className="px-2 py-1 border">Supplier remarks</th>
            <th className="px-2 py-1 border">Supplier Grading</th>
            {showAdvanced && (
              <>
                <th className="px-2 py-1 border">Refurb Diagnostics</th>
                <th className="px-2 py-1 border">RMA Defect Description</th>
                <th className="px-2 py-1 border">RMA</th>
                <th className="px-2 py-1 border">Compensation</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {/* ⬇️ Normale rijen uit de DB */}
          {hasItems &&
            items.map((it, idx) => {
              const lockedSku = isLockedSupplierCell(it, "sku");
              const lockedUsedParts = isLockedSupplierCell(it, "used_parts");
              const lockedPrice = isLockedSupplierCell(it, "price_cents");
              const lockedDesc = isLockedSupplierCell(it, "description");
              const lockedSuppErr = isLockedSupplierCell(
                it,
                "supplier_device_errors"
              );
              const lockedSuppGrad = isLockedSupplierCell(
                it,
                "supplier_grading"
              );

              const imeiSn = (it as any).imei_sn ?? "";
              const manualSn = (it as any).manual_sn ?? "";
              const locationValue = (it as any).location ?? "";
              const imeiLocked = !!imeiSn; // eenmaal data aanwezig → niet meer editable

              return (
                <tr key={it.id} className="border-t hover:bg-slate-50/50">
                  {/* Status (dropdown) */}
                  <td className="px-1 py-0.5 border">
                    <select
                      value={it.refurb_status ?? ""}
                      onChange={(e) =>
                        handleCellChange(
                          it.id,
                          "refurb_status",
                          e.target.value
                        )
                      }
                      className="h-7 min-h-[28px] w-full rounded border border-slate-200 bg-white px-2 text-[11px] leading-[28px] text-slate-900"
                    >
                      <option value="">— kies status —</option>
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Location (dropdown) */}
                  <td className="px-1 py-0.5 border">
                    <select
                      value={locationValue ?? ""}
                      onChange={(e) =>
                        handleCellChange(it.id, "location", e.target.value)
                      }
                      className="h-7 min-h-[28px] w-full rounded border border-slate-200 bg-white px-2 text-[11px] leading-[28px] text-slate-900"
                    >
                      <option value="">— kies locatie —</option>
                      {locationOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* IMEI/SN (uit import, na invullen niet meer editable) */}
                  <td className="px-1 py-0.5 border">
                    {imeiLocked ? (
                      <span
                        className="block truncate max-w-[200px]"
                        title={imeiSn}
                      >
                        {imeiSn}
                      </span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        value={imeiSn}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItems((prev) =>
                            prev.map((row) =>
                              row.id === it.id
                                ? ({ ...row, imei_sn: val } as any)
                                : row
                            )
                          );
                        }}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "imei_sn",
                            e.target.value.trim()
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "imei_sn")
                        }
                      />
                    )}
                  </td>

                  {/* SN (manueel) */}
                  {showExtraSn && (
                    <td className="px-1 py-0.5 border">
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        value={manualSn}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItems((prev) =>
                            prev.map((row) =>
                              row.id === it.id
                                ? ({ ...row, manual_sn: val } as any)
                                : row
                            )
                          );
                        }}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "manual_sn",
                            e.target.value.trim()
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "manual_sn")
                        }
                      />
                    </td>
                  )}

                  {/* SKU */}
                  <td className="px-1 py-0.5 border">
                    {lockedSku ? (
                      <span
                        className="block truncate max-w-[200px]"
                        title={it.sku ?? ""}
                      >
                        {it.sku}
                      </span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        defaultValue={it.sku ?? ""}
                        onBlur={(e) =>
                          handleCellChange(it.id, "sku", e.target.value)
                        }
                        onPaste={(e) => handlePasteToColumn(e, idx, "sku")}
                      />
                    )}
                  </td>

                  {/* Used parts (meerdere SKU's via +) */}
                  <td className="px-1 py-0.5 border">
                    <UsedPartsCell
                      rawValue={it.used_parts ?? ""}
                      locked={lockedUsedParts}
                      onChange={(raw) =>
                        handleCellChange(it.id, "used_parts", raw)
                      }
                      onPasteToColumn={(e) =>
                        handlePasteToColumn(e, idx, "used_parts")
                      }
                    />
                  </td>

                  {/* Price */}
                  <td className="px-1 py-0.5 border">
                    {lockedPrice ? (
                      <span>{money(it.price_cents)}</span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full text-right"
                        defaultValue={
                          typeof it.price_cents === "number"
                            ? (it.price_cents / 100).toString()
                            : ""
                        }
                        placeholder="0,00"
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "price_cents",
                            e.target.value
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "price_cents")
                        }
                      />
                    )}
                  </td>

                  {/* Description */}
                  <td className="px-1 py-0.5 border">
                    {lockedDesc ? (
                      <span
                        className="block truncate max-w-[260px]"
                        title={it.description ?? ""}
                      >
                        {it.description}
                      </span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        defaultValue={it.description ?? ""}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "description",
                            e.target.value
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "description")
                        }
                      />
                    )}
                  </td>

                  {/* Supplier remarks */}
                  <td className="px-1 py-0.5 border">
                    {lockedSuppErr ? (
                      <span
                        className="block truncate max-w-[260px]"
                        title={it.supplier_device_errors ?? ""}
                      >
                        {it.supplier_device_errors}
                      </span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        defaultValue={it.supplier_device_errors ?? ""}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "supplier_device_errors",
                            e.target.value
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(
                            e,
                            idx,
                            "supplier_device_errors"
                          )
                        }
                      />
                    )}
                  </td>

                  {/* Supplier Grading */}
                  <td className="px-1 py-0.5 border">
                    {lockedSuppGrad ? (
                      <span>{it.supplier_grading}</span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        defaultValue={it.supplier_grading ?? ""}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "supplier_grading",
                            e.target.value
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "supplier_grading")
                        }
                      />
                    )}
                  </td>

                  {showAdvanced && (
                    <>
                      {/* Refurb Diagnostics */}
                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.refurb_diagnostics ?? ""}
                          onBlur={(e) =>
                            handleCellChange(
                              it.id,
                              "refurb_diagnostics",
                              e.target.value
                            )
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(
                              e,
                              idx,
                              "refurb_diagnostics"
                            )
                          }
                        />
                      </td>

                      {/* RMA Defect Description */}
                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.rma_defect_description ?? ""}
                          onBlur={(e) =>
                            handleCellChange(
                              it.id,
                              "rma_defect_description",
                              e.target.value
                            )
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(
                              e,
                              idx,
                              "rma_defect_description"
                            )
                          }
                        />
                      </td>

                      {/* RMA */}
                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.rma ?? ""}
                          onBlur={(e) =>
                            handleCellChange(it.id, "rma", e.target.value)
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(e, idx, "rma")
                          }
                        />
                      </td>

                      {/* Compensation */}
                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full text-right"
                          defaultValue={
                            typeof it.compensation_cents === "number"
                              ? (it.compensation_cents / 100).toString()
                              : ""
                          }
                          placeholder="0,00"
                          onBlur={(e) =>
                            handleCellChange(
                              it.id,
                              "compensation_cents",
                              e.target.value
                            )
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(
                              e,
                              idx,
                              "compensation_cents"
                            )
                          }
                        />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

          {/* ⬇️ Lege start-rij als er nog geen items zijn → hier kan je plakken */}
          {!hasItems && (
            <tr className="border-t">
              {/* Status (start: paste mogelijk) */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak status hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "refurb_status")}
                />
              </td>

              {/* Location */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak locaties hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "location")}
                />
              </td>

              {/* IMEI/SN */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak IMEI/SN kolom hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "imei_sn")}
                />
              </td>

              {/* SN (alleen tonen als Extra SN actief is) */}
              {showExtraSn && (
                <td className="px-1 py-0.5 border">
                  <input
                    className="bb-input h-7 text-[11px] px-1 w-full"
                    placeholder="Plak SN kolom hier"
                    onPaste={(e) => handlePasteToColumn(e, 0, "manual_sn")}
                  />
                </td>
              )}

              {/* SKU */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak SKU-kolom hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "sku")}
                />
              </td>

              {/* Used parts */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak Used parts-kolom hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "used_parts")
                  }
                />
              </td>

              {/* Price */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full text-right"
                  placeholder="Plak prijzen hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "price_cents")}
                />
              </td>

              {/* Description */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak Description-kolom hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "description")
                  }
                />
              </td>

              {/* Supplier remarks */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak Supplier remarks hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "supplier_device_errors")
                  }
                />
              </td>

              {/* Supplier Grading */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak grading hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "supplier_grading")
                  }
                />
              </td>

              {showAdvanced && (
                <>
                  {/* Refurb Diagnostics */}
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      placeholder="Plak refurb diagnostics hier"
                      onPaste={(e) =>
                        handlePasteToColumn(
                          e,
                          0,
                          "refurb_diagnostics"
                        )
                      }
                    />
                  </td>

                  {/* RMA Defect Description */}
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      placeholder="Plak RMA defect beschrijving hier"
                      onPaste={(e) =>
                        handlePasteToColumn(
                          e,
                          0,
                          "rma_defect_description"
                        )
                      }
                    />
                  </td>

                  {/* RMA */}
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      placeholder="Plak RMA-codes hier"
                      onPaste={(e) =>
                        handlePasteToColumn(e, 0, "rma")
                      }
                    />
                  </td>

                  {/* Compensation */}
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full text-right"
                      placeholder="Plak compensaties hier"
                      onPaste={(e) =>
                        handlePasteToColumn(
                          e,
                          0,
                          "compensation_cents"
                        )
                      }
                    />
                  </td>
                </>
              )}
            </tr>
          )}

          {!hasItems && (
            <tr>
              <td
                className="px-2 py-3 border text-[11px] text-slate-500"
                colSpan={colSpan}
              >
                Nog geen toestellen in deze receptie. Plak een kolom uit Excel
                in één van de velden hierboven (bv. IMEI/SN, SKU, Description,
                Price...) om rijen aan te maken. Status en Location gebruiken
                hun ingestelde default-waarde bij het importeren.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
