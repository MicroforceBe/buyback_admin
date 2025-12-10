// app/admin/refurb/RefurbReceptionTable.tsx
"use client";

import { useState } from "react";
import {
  RefurbItem,
  updateRefurbItemCell,
  pasteIntoRefurbColumn,
} from "./actions";

type Props = {
  receptionId: string;
  initialItems: RefurbItem[];
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

export default function RefurbReceptionTable({
  receptionId,
  initialItems,
}: Props) {
  const [items, setItems] = useState<RefurbItem[]>(initialItems);
  const [isPasting, setIsPasting] = useState(false);

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
      | "compensation_cents",
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
      await updateRefurbItemCell(itemId, field, value);
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
        field,
        lines
      );
      setItems(updated);
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

  const hasItems = items.length > 0;

  return (
    <div className="border rounded-md overflow-x-auto text-xs mt-4">
      <div className="flex items-center justify-between px-2 py-1 border-b bg-slate-50">
        <span className="font-medium text-[11px] uppercase tracking-wide">
          Refurb Reception items
        </span>
        {isPasting && (
          <span className="text-[11px] text-slate-500">
            Gegevens plakken...
          </span>
        )}
      </div>
      <table className="min-w-full border-collapse">
        <thead className="bg-slate-50 text-[11px] uppercase">
          <tr>
            <th className="px-2 py-1 border">Refurb Status</th>
            <th className="px-2 py-1 border">SKU</th>
            <th className="px-2 py-1 border">Used parts</th>
            <th className="px-2 py-1 border">Price</th>
            <th className="px-2 py-1 border">Description</th>
            <th className="px-2 py-1 border">Supplier Device Errors</th>
            <th className="px-2 py-1 border">Supplier Grading</th>
            <th className="px-2 py-1 border">Refurb Diagnostics</th>
            <th className="px-2 py-1 border">RMA Defect Description</th>
            <th className="px-2 py-1 border">RMA</th>
            <th className="px-2 py-1 border">Compensation</th>
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

              return (
                <tr key={it.id} className="border-t hover:bg-slate-50/50">
                  {/* Refurb Status (altijd bewerkbaar) */}
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      defaultValue={it.refurb_status}
                      onBlur={(e) =>
                        handleCellChange(it.id, "refurb_status", e.target.value)
                      }
                      onPaste={(e) =>
                        handlePasteToColumn(e, idx, "refurb_status")
                      }
                    />
                  </td>

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

                  {/* Used parts */}
                  <td className="px-1 py-0.5 border">
                    {lockedUsedParts ? (
                      <span
                        className="block truncate max-w-[200px]"
                        title={it.used_parts ?? ""}
                      >
                        {it.used_parts}
                      </span>
                    ) : (
                      <input
                        className="bb-input h-7 text-[11px] px-1 w-full"
                        defaultValue={it.used_parts ?? ""}
                        onBlur={(e) =>
                          handleCellChange(
                            it.id,
                            "used_parts",
                            e.target.value
                          )
                        }
                        onPaste={(e) =>
                          handlePasteToColumn(e, idx, "used_parts")
                        }
                      />
                    )}
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

                  {/* Supplier Device Errors */}
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
                        handlePasteToColumn(e, idx, "refurb_diagnostics")
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
                        handlePasteToColumn(e, idx, "rma_defect_description")
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
                      onPaste={(e) => handlePasteToColumn(e, idx, "rma")}
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
                        handlePasteToColumn(e, idx, "compensation_cents")
                      }
                    />
                  </td>
                </tr>
              );
            })}

          {/* ⬇️ Lege start-rij als er nog geen items zijn → hier kan je plakken */}
          {!hasItems && (
            <tr className="border-t">
              {/* Refurb Status */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak hier om te starten"
                  onPaste={(e) => handlePasteToColumn(e, 0, "refurb_status")}
                />
              </td>

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
                  onPaste={(e) => handlePasteToColumn(e, 0, "used_parts")}
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
                  onPaste={(e) => handlePasteToColumn(e, 0, "description")}
                />
              </td>

              {/* Supplier Device Errors */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak Supplier errors hier"
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

              {/* Refurb Diagnostics */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak refurb diagnostics hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "refurb_diagnostics")
                  }
                />
              </td>

              {/* RMA Defect Description */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak RMA defect beschrijving hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "rma_defect_description")
                  }
                />
              </td>

              {/* RMA */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full"
                  placeholder="Plak RMA-codes hier"
                  onPaste={(e) => handlePasteToColumn(e, 0, "rma")}
                />
              </td>

              {/* Compensation */}
              <td className="px-1 py-0.5 border">
                <input
                  className="bb-input h-7 text-[11px] px-1 w-full text-right"
                  placeholder="Plak compensaties hier"
                  onPaste={(e) =>
                    handlePasteToColumn(e, 0, "compensation_cents")
                  }
                />
              </td>
            </tr>
          )}

          {!hasItems && (
            <tr>
              <td
                className="px-2 py-3 border text-[11px] text-slate-500"
                colSpan={11}
              >
                Nog geen toestellen in deze receptie. Plak een kolom uit Excel in
                één van de velden hierboven (bv. SKU, Description, Price...) om
                rijen aan te maken.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
