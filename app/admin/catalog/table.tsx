// app/admin/catalog/table.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import {
  saveCatalogRowField,
  uploadCatalogRowImage,
  deleteCatalogRow,
  createCatalogRow,
} from "./actions";
import type { CatalogRow } from "./actions";

type Props = {
  /** Geselecteerde categorie of null voor "Alle" */
  category: string | null;
  /** Reeds geprefetchte rijen uit buyback_catalog */
  rows: CatalogRow[];
  /** Alle categorie-namen t.b.v. toevoegen/wijzigen */
  allCategories: string[];
};

export default function Table({ category, rows, allCategories }: Props) {
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | number | null>(null);
  const [localRows, setLocalRows] = useState<CatalogRow[]>(rows);

  // Zorg dat de lokaal weergegeven rijen mee evolueren als props wijzigen (bij wisselen categorie)
  // (Eenvoudige sync – geen deep merge nodig hier)
  if (localRows !== rows && JSON.stringify(localRows) !== JSON.stringify(rows)) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setLocalRows(rows);
  }

  const filtered = useMemo(() => {
    const list = localRows || [];
    const byCat = category ? list.filter((r) => (r.category || "") === category) : list;
    const qv = q.trim().toLowerCase();
    if (!qv) return byCat;
    return byCat.filter(
      (r) =>
        (r.brand || "").toLowerCase().includes(qv) ||
        (r.model || "").toLowerCase().includes(qv) ||
        (r.variant || "").toLowerCase().includes(qv)
    );
  }, [localRows, category, q]);

  // File inputs per rij
  const fileInputs = useRef<Record<string | number, HTMLInputElement | null>>({});

  async function persist<K extends keyof CatalogRow>(
    row: CatalogRow,
    key: K,
    value: CatalogRow[K]
  ) {
    try {
      setPending(row.id);
      // Optimistic UI
      setLocalRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, [key]: value } : r))
      );
      await saveCatalogRowField(row.id, key as string, value as any);
    } catch (e) {
      console.error(e);
      // Hard refresh van rij bij fout? Voor nu: geen rollback, admin ziet fout in console.
    } finally {
      setPending(null);
    }
  }

  async function handleUpload(row: CatalogRow, file: File | null) {
    if (!file) return;
    try {
      setPending(row.id);
      const newUrl = await uploadCatalogRowImage(row.id, file);
      if (newUrl) {
        setLocalRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, image_url: newUrl } : r))
        );
      }
    } catch (e) {
      console.error(e);
      alert("Upload mislukt.");
    } finally {
      setPending(null);
    }
  }

  async function handleDelete(row: CatalogRow) {
    if (!confirm(`Model verwijderen: ${row.brand ?? ""} ${row.model ?? ""}?`)) return;
    try {
      setPending(row.id);
      await deleteCatalogRow(row.id);
      setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      console.error(e);
      alert("Verwijderen mislukt.");
    } finally {
      setPending(null);
    }
  }

  async function handleAdd() {
    const brand = prompt("Merk (bv. Apple, Samsung):")?.trim();
    if (!brand) return;
    const model = prompt("Model (bv. iPhone 11):")?.trim();
    if (!model) return;

    // capacity & price minimaal vragen (widget rekent hiermee verder)
    const capacityStr = prompt("Capaciteit (GB, geheel getal):", "64")?.trim();
    const capacity = capacityStr ? parseInt(capacityStr, 10) : NaN;
    if (!Number.isFinite(capacity)) return;

    const priceStr = prompt("Basisprijs in eurocent (bv. 15000):", "15000")?.trim();
    const base_price_cents = priceStr ? parseInt(priceStr, 10) : NaN;
    if (!Number.isFinite(base_price_cents)) return;

    try {
      setPending("new");
      const cat =
        category && category !== "__ALL__"
          ? category
          : prompt(
              "Categorie (bv. iPhone, iPad, Android):",
              allCategories[0] || "iPhone"
            )?.trim() || null;

      const row = await createCatalogRow({
        brand,
        category: cat,
        model,
        variant: null,
        capacity_gb: capacity,
        base_price_cents,
        active: true,
        image_url: null,
      });

      setLocalRows((prev) => [row, ...prev]);
    } catch (e) {
      console.error(e);
      alert("Aanmaken mislukt.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Zoek en actiebar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op merk/model/variant…"
          className="w-full sm:w-80 border rounded px-3 py-2"
        />
        <div className="flex-1" />
        <button onClick={handleAdd} className="bb-btn">Model toevoegen</button>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-gray-500">
              <th className="px-2">Foto</th>
              <th className="px-2">Merk</th>
              <th className="px-2">Model</th>
              <th className="px-2">Variant</th>
              <th className="px-2">Cap. (GB)</th>
              <th className="px-2">Basisprijs (cents)</th>
              <th className="px-2">Categorie</th>
              <th className="px-2">Actief</th>
              <th className="px-2 text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const busy = pending === r.id;
              return (
                <tr key={r.id} className="bg-white shadow-sm rounded">
                  {/* Foto */}
                  <td className="px-2 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-14 bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.image_url}
                            alt={r.model || ""}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-gray-400">geen</span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          ref={(el) => {
                            fileInputs.current[r.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleUpload(r, e.currentTarget.files?.[0] || null)
                          }
                        />
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => fileInputs.current[r.id]?.click()}
                          disabled={busy}
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Merk */}
                  <td className="px-2 py-2 align-middle">
                    <input
                      defaultValue={r.brand || ""}
                      className="w-36 border rounded px-2 py-1"
                      onBlur={(e) => persist(r, "brand", e.currentTarget.value)}
                      disabled={busy}
                    />
                  </td>

                  {/* Model */}
                  <td className="px-2 py-2 align-middle">
                    <input
                      defaultValue={r.model || ""}
                      className="w-44 border rounded px-2 py-1"
                      onBlur={(e) => persist(r, "model", e.currentTarget.value)}
                      disabled={busy}
                    />
                  </td>

                  {/* Variant */}
                  <td className="px-2 py-2 align-middle">
                    <input
                      defaultValue={r.variant || ""}
                      className="w-36 border rounded px-2 py-1"
                      onBlur={(e) =>
                        persist(r, "variant", e.currentTarget.value || null)
                      }
                      disabled={busy}
                    />
                  </td>

                  {/* Cap GB */}
                  <td className="px-2 py-2 align-middle">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={r.capacity_gb ?? 0}
                      className="w-24 border rounded px-2 py-1 text-right"
                      onBlur={(e) =>
                        persist(r, "capacity_gb", parseInt(e.currentTarget.value, 10) || 0)
                      }
                      disabled={busy}
                    />
                  </td>

                  {/* Basisprijs (cents) */}
                  <td className="px-2 py-2 align-middle">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={r.base_price_cents ?? 0}
                      className="w-28 border rounded px-2 py-1 text-right"
                      onBlur={(e) =>
                        persist(
                          r,
                          "base_price_cents",
                          parseInt(e.currentTarget.value, 10) || 0
                        )
                      }
                      disabled={busy}
                    />
                  </td>

                  {/* Categorie (dropdown) */}
                  <td className="px-2 py-2 align-middle">
                    <select
                      defaultValue={r.category ?? ""}
                      className="w-40 border rounded px-2 py-1 bg-white"
                      onBlur={(e) =>
                        persist(r, "category", e.currentTarget.value || null)
                      }
                      disabled={busy}
                    >
                      <option value="">—</option>
                      {allCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Actief (toggle slider) */}
                  <td className="px-2 py-2 align-middle">
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        defaultChecked={!!r.active}
                        onChange={(e) => persist(r, "active", !!e.currentTarget.checked)}
                        disabled={busy}
                      />
                      <div className="w-10 h-5 bg-gray-300 rounded-full peer-checked:bg-emerald-500 transition-colors relative">
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                      </div>
                    </label>
                  </td>

                  {/* Acties */}
                  <td className="px-2 py-2 align-middle text-right">
                    <button
                      className="px-2 py-1 text-red-600 hover:text-red-700"
                      title="Verwijderen"
                      onClick={() => handleDelete(r)}
                      disabled={busy}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-sm text-gray-500">
                  Geen resultaten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kleine hint */}
      <p className="text-xs text-gray-500">
        Tip: cellen worden automatisch bewaard wanneer je het veld verlaat.
      </p>
    </div>
  );
}
