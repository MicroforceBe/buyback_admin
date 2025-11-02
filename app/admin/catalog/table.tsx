// app/admin/catalog/table.tsx
"use client";

import { useMemo, useRef } from "react";
import {
  type ModelRow,
  createModelAction,
  updateModelFieldAction,
  toggleModelActiveAction,
  deleteModelAction,
  uploadModelImageAction,
} from "./actions";

export default function CatalogTable({
  rows,
  categoryId,
  query,
}: {
  rows: ModelRow[];
  categoryId: string;
  query?: string;
}) {
  const q = (query || "").trim().toLowerCase();
  const filtered = useMemo(
    () =>
      !q
        ? rows
        : rows.filter((r) =>
            [r.brand || "", r.model || ""].some((s) => s.toLowerCase().includes(q))
          ),
    [rows, q]
  );

  // file inputs per row
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const eur = (cents: number | null | undefined) =>
    (Math.round((cents ?? 0) / 5) * 5 / 100).toLocaleString("nl-BE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    });

  return (
    <div className="rounded border bg-white overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left w-[90px]">Foto</th>
            <th className="px-3 py-2 text-left">Merk</th>
            <th className="px-3 py-2 text-left">Model</th>
            <th className="px-3 py-2 text-left">Basisprijs (EUR)</th>
            <th className="px-3 py-2 text-left">Actief</th>
            <th className="px-3 py-2 text-left w-[70px]">Acties</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            return (
              <tr key={r.id} className="border-t">
                {/* Foto */}
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-2">
                    <div className="w-14 h-14 bg-gray-100 border rounded overflow-hidden flex items-center justify-center">
                      {r.image_url ? (
                        <img src={r.image_url} alt={r.model} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-gray-400 p-1 text-center">Geen<br/>foto</span>
                      )}
                    </div>
                    <form action={uploadModelImageAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        ref={(el) => {
                          fileInputs.current[r.id] = el;
                          return;
                        }}
                        type="file"
                        name="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          // auto-submit bij file select
                          if (e.currentTarget.form) e.currentTarget.form.requestSubmit();
                        }}
                      />
                      <button
                        type="button"
                        className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                        onClick={() => fileInputs.current[r.id]?.click()}
                      >
                        Wijzig foto
                      </button>
                    </form>
                  </div>
                </td>

                {/* Merk */}
                <td className="px-3 py-2 align-top">
                  <InlineEdit
                    initialValue={r.brand || ""}
                    onCommit={(val) =>
                      submitUpdate({ id: r.id, field: "brand", value: val })
                    }
                  />
                </td>

                {/* Model */}
                <td className="px-3 py-2 align-top">
                  <InlineEdit
                    initialValue={r.model}
                    onCommit={(val) =>
                      submitUpdate({ id: r.id, field: "model", value: val })
                    }
                  />
                </td>

                {/* Basisprijs (EUR) */}
                <td className="px-3 py-2 align-top">
                  <InlineEdit
                    initialValue={((r.base_price_cents ?? 0) / 100).toString().replace(".", ",")}
                    inputMode="decimal"
                    onCommit={(val) =>
                      submitUpdate({ id: r.id, field: "base_price_cents", value: val })
                    }
                  />
                  <div className="text-[11px] text-gray-500">{eur(r.base_price_cents)}</div>
                </td>

                {/* Actief toggle (slider) */}
                <td className="px-3 py-2 align-top">
                  <form action={toggleModelActiveAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="next" value={(!r.active)?.toString()} />
                    <label className="inline-flex items-center cursor-pointer">
                      <span className="sr-only">Actief</span>
                      <span
                        className={
                          "relative inline-block w-11 h-6 rounded-full transition-colors " +
                          (r.active ? "bg-green-600" : "bg-gray-300")
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement | null;
                          if (form) form.requestSubmit();
                        }}
                      >
                        <span
                          className={
                            "absolute top-[2px] left-[2px] inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform " +
                            (r.active ? "translate-x-5" : "translate-x-0")
                          }
                        />
                      </span>
                    </label>
                  </form>
                </td>

                {/* Acties */}
                <td className="px-3 py-2 align-top">
                  <form
                    action={deleteModelAction}
                    onSubmit={(e) => {
                      if (!confirm(`Model "${r.model}" verwijderen?`)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="image_path" value={r.image_path ?? ""} />
                    <button
                      type="submit"
                      className="p-2 rounded hover:bg-red-50"
                      title="Verwijderen"
                      aria-label="Verwijderen"
                    >
                      {/* vuilbak icoon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}

          {/* Voeg nieuw model toe */}
          <tr className="border-t bg-gray-50">
            <td className="px-3 py-3 text-[12px] text-gray-500">Nieuwe foto uploaden kan na bewaren</td>
            <td colSpan={4} className="px-3 py-2">
              <AddModelRow categoryId={categoryId} />
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** ===== Helpers ===== */

function submitUpdate(payload: { id: string; field: string; value: string }) {
  const fd = new FormData();
  fd.set("id", payload.id);
  fd.set("field", payload.field);
  fd.set("value", payload.value);
  // Server Action via fetch (formless)
  // @ts-ignore – server action callable as function with FormData
  return updateModelFieldAction(fd);
}

function InlineEdit({
  initialValue,
  inputMode,
  onCommit,
}: {
  initialValue: string;
  inputMode?: "decimal" | "text";
  onCommit: (value: string) => void | Promise<void>;
}) {
  return (
    <input
      defaultValue={initialValue}
      inputMode={inputMode || "text"}
      className="w-full px-2 py-1 rounded border bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v !== initialValue) onCommit(v);
      }}
    />
  );
}

function AddModelRow({ categoryId }: { categoryId: string }) {
  return (
    <form action={createModelAction} className="grid grid-cols-1 md:grid-cols-[140px_1fr_160px_auto] gap-2">
      <input type="hidden" name="category_id" value={categoryId} />
      <input
        name="brand"
        placeholder="Merk"
        className="px-2 py-2 rounded border bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
      />
      <input
        name="model"
        placeholder="Model (bv. iPhone 11)"
        required
        className="px-2 py-2 rounded border bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
      />
      <input
        name="base_price_eur"
        placeholder="Basisprijs €"
        inputMode="decimal"
        className="px-2 py-2 rounded border bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600"
      />
      <button
        type="submit"
        className="px-3 py-2 rounded border bg-white hover:bg-gray-50 md:justify-self-start"
      >
        + Toevoegen
      </button>
    </form>
  );
}
