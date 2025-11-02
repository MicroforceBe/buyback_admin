'use client';

import { useMemo, useRef, useState } from "react";
import {
  saveCatalogRowField,
  uploadCatalogRowImage,
  deleteCatalogRow,
  createCatalogRow,
} from "./actions";

export type CatalogRow = {
  id: number;
  brand: string;
  category: string | null;
  model: string;
  variant: string | null;
  capacity_gb: number;
  base_price_cents: number;
  image_url: string | null;
  active: boolean;
  updated_at?: string;
};

type Props = {
  category: string | null;
  rows: CatalogRow[];
  allCategories: string[];
};

/** Type guard: controleer of een onbekend object een volledige CatalogRow is */
function isFullCatalogRow(v: unknown): v is CatalogRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    typeof o.brand === "string" &&
    ("category" in o) &&
    typeof o.model === "string" &&
    ("variant" in o) &&
    typeof o.capacity_gb === "number" &&
    typeof o.base_price_cents === "number" &&
    ("image_url" in o) &&
    typeof o.active === "boolean"
  );
}

export default function Table({ category, rows, allCategories }: Props) {
  const [localRows, setLocalRows] = useState<CatalogRow[]>(rows);
  const [pending, setPending] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return localRows;
    return localRows.filter((r) => {
      return (
        (r.brand || "").toLowerCase().includes(q) ||
        (r.model || "").toLowerCase().includes(q) ||
        (r.variant || "").toLowerCase().includes(q) ||
        String(r.capacity_gb || "").toLowerCase().includes(q)
      );
    });
  }, [localRows, filter]);

  async function handleSave<K extends keyof CatalogRow>(
    row: CatalogRow,
    field: K,
    value: CatalogRow[K]
  ) {
    try {
      setPending(row.id);
      const ok = await saveCatalogRowField(row.id, field as string, value as any);
      if (ok) {
        setLocalRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r))
        );
      } else {
        alert("Bewaren mislukt");
      }
    } catch (e: any) {
      alert(e?.message || "Bewaren mislukt");
    } finally {
      setPending(null);
    }
  }

  async function handleDelete(row: CatalogRow) {
    if (!confirm(`Verwijder ${row.brand} ${row.model} (${row.capacity_gb} GB)?`)) return;
    try {
      setPending(row.id);
      const ok = await deleteCatalogRow(row.id);
      if (ok) {
        setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        alert("Verwijderen mislukt");
      }
    } catch (e: any) {
      alert(e?.message || "Verwijderen mislukt");
    } finally {
      setPending(null);
    }
  }

  async function handleAdd() {
    try {
      setCreating(true);
      // Minimale defaults voor nieuwe rij
      const baseDefaults: Omit<CatalogRow, "id"> = {
        brand: "",
        category: category ?? null,
        model: "",
        variant: null,
        capacity_gb: 64,
        base_price_cents: 0,
        image_url: null,
        active: true,
      };

      const created: unknown = await createCatalogRow(baseDefaults);

      // Bouween volledige CatalogRow, ongeacht server-respons
      let newRow: CatalogRow;
      if (isFullCatalogRow(created)) {
        newRow = created;
      } else if (
        created &&
        typeof created === "object" &&
        "id" in (created as any) &&
        typeof (created as any).id !== "undefined"
      ) {
        const idNum = Number((created as any).id);
        newRow = { id: idNum, ...baseDefaults };
      } else {
        throw new Error("Ongeldig antwoord van server bij aanmaken (geen id).");
      }

      setLocalRows((prev) => [newRow, ...prev]);
    } catch (e: any) {
      alert(e?.message || "Aanmaken mislukt");
    } finally {
      setCreating(false);
    }
  }

  function onPickImage(row: CatalogRow) {
    const el = fileInputs.current[row.id];
    if (el) el.click();
  }

  async function onChangeFile(row: CatalogRow, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      setPending(row.id);

      // Upload via FormData (server action verwacht FormData)
      const fd = new FormData();
      fd.append("rowId", String(row.id));
      fd.append("file", file);

      const newUrl = await uploadCatalogRowImage(fd);
      if (typeof newUrl === "string" && newUrl.length > 0) {
        setLocalRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, image_url: newUrl } : r))
        );
      } else {
        alert("Upload mislukt");
      }
    } catch (e: any) {
      alert(e?.message || "Upload mislukt");
    } finally {
      setPending(null);
      e.currentTarget.value = ""; // opnieuw dezelfde file kunnen kiezen
    }
  }

  return (
    <div className="space-y-3">
      {/* Topbar: filter en toevoegen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          {category ? (
            <>Geselecteerde categorie: <span className="font-medium">{category}</span></>
          ) : (
            <>Alle categorieën</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter in deze lijst…"
            className="border rounded px-3 py-2 text-sm"
          />
          <button className="bb-btn" onClick={handleAdd} disabled={creating}>
            {creating ? "Toevoegen…" : "Model toevoegen"}
          </button>
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded border">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left w-[84px]">Foto</th>
              <th className="px-3 py-2 text-left w-[140px]">Categorie</th>
              <th className="px-3 py-2 text-left w-[140px]">Merk</th>
              <th className="px-3 py-2 text-left w-[220px]">Model</th>
              <th className="px-3 py-2 text-left w-[160px]">Variant</th>
              <th className="px-3 py-2 text-right w-[110px]">Cap. (GB)</th>
              <th className="px-3 py-2 text-right w-[140px]">Basisprijs (€)</th>
              <th className="px-3 py-2 text-center w-[120px]">Actief</th>
              <th className="px-3 py-2 text-right w-[80px]">Acties</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isRowPending = pending === row.id;
              return (
                <tr key={row.id} className="border-t">
                  {/* Foto */}
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-10 bg-gray-100 border rounded overflow-hidden flex items-center justify-center">
                        {row.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image_url}
                            alt={`${row.brand} ${row.model}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-[11px] text-gray-400">geen</span>
                        )}
                      </div>
                      <div>
                        <button
                          type="button"
                          className="bb-btn"
                          onClick={() => onPickImage(row)}
                          disabled={isRowPending}
                        >
                          Upload
                        </button>
                        {/* verborgen file input */}
                        <input
                          ref={(el) => {
                            fileInputs.current[row.id] = el ?? null;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onChangeFile(row, e)}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Categorie */}
                  <td className="px-3 py-2">
                    <select
                      className="w-full border rounded px-2 py-1 bg-white"
                      value={row.category ?? ""}
                      onChange={(e) => handleSave(row, "category", e.target.value || null)}
                      disabled={isRowPending}
                    >
                      <option value="">—</option>
                      {allCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>

                  {/* Merk */}
                  <td className="px-3 py-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={row.brand}
                      onChange={(e) =>
                        setLocalRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, brand: e.target.value } : r))
                        )
                      }
                      onBlur={(e) => handleSave(row, "brand", e.target.value)}
                      disabled={isRowPending}
                    />
                  </td>

                  {/* Model */}
                  <td className="px-3 py-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={row.model}
                      onChange={(e) =>
                        setLocalRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, model: e.target.value } : r))
                        )
                      }
                      onBlur={(e) => handleSave(row, "model", e.target.value)}
                      disabled={isRowPending}
                    />
                  </td>

                  {/* Variant */}
                  <td className="px-3 py-2">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={row.variant ?? ""}
                      onChange={(e) =>
                        setLocalRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, variant: e.target.value || null } : r))
                        )
                      }
                      onBlur={(e) => handleSave(row, "variant", (e.target.value || null) as any)}
                      disabled={isRowPending}
                    />
                  </td>

                  {/* Capaciteit */}
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-full border rounded px-2 py-1 text-right"
                      inputMode="numeric"
                      pattern="\d*"
                      value={row.capacity_gb}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, "");
                        const n = v ? parseInt(v, 10) : 0;
                        setLocalRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, capacity_gb: n } : r))
                        );
                      }}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value || "0", 10);
                        handleSave(row, "capacity_gb", Number.isFinite(n) ? n : 0);
                      }}
                      disabled={isRowPending}
                    />
                  </td>

                  {/* Basisprijs (euro -> cents) */}
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-full border rounded px-2 py-1 text-right"
                      inputMode="decimal"
                      value={(row.base_price_cents / 100).toFixed(2)}
                      onChange={(e) => {
                        const v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
                        setLocalRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  base_price_cents: Math.round((parseFloat(v || "0") || 0) * 100),
                                }
                              : r
                          )
                        );
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
                        const cents = Math.round((parseFloat(v || "0") || 0) * 100);
                        handleSave(row, "base_price_cents", cents);
                      }}
                      disabled={isRowPending}
                    />
                  </td>

                  {/* Actief toggle */}
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={!!row.active}
                        onChange={(e) => {
                          const next = !!e.target.checked;
                          setLocalRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, active: next } : r))
                          );
                          handleSave(row, "active", next);
                        }}
                        disabled={isRowPending}
                      />
                      <span
                        className={`relative inline-block w-10 h-6 rounded-full transition ${
                          row.active ? "bg-emerald-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            row.active ? "translate-x-4" : ""
                          }`}
                        />
                      </span>
                    </label>
                  </td>

                  {/* Acties */}
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => handleDelete(row)}
                      disabled={isRowPending}
                      title="Verwijderen"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}

            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  Geen resultaten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        Tip: De widget leest live uit <code>buyback_catalog</code>. Met de “Actief”-toggle maak je varianten (tijdelijk) zichtbaar/onzichtbaar.
      </p>
    </div>
  );
}
