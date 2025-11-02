"use client";

import * as React from "react";
import type { CatalogRow } from "./actions";
import {
  toggleActive,
  updatePriceCents,
  deleteRow,
  createRow,
  uploadModelImageAction,
  setModelActiveForAll,
} from "./actions";

type Props = {
  rows: CatalogRow[];
  selectedCategory: string | null;
};

export default function CatalogTable({ rows, selectedCategory }: Props) {
  const [local, setLocal] = React.useState<CatalogRow[]>(rows);
  const [savingIds, setSavingIds] = React.useState<Record<number, boolean>>({});
  const [adding, setAdding] = React.useState(false);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    setLocal(rows);
  }, [rows]);

  function setSaving(id: number, on: boolean) {
    setSavingIds(s => ({ ...s, [id]: on }));
  }

  async function onToggle(r: CatalogRow, next: boolean) {
    setSaving(r.id, true);
    setLocal(ls => ls.map(x => x.id === r.id ? { ...x, active: next } : x));
    try {
      await toggleActive(r.id, next);
    } catch (e:any) {
      alert(e?.message || e);
      // revert
      setLocal(ls => ls.map(x => x.id === r.id ? { ...x, active: !next } : x));
    } finally {
      setSaving(r.id, false);
    }
  }

  async function onPriceChange(r: CatalogRow, eurStr: string) {
    const clean = eurStr.replace(",", ".").trim();
    const eur = Number(clean);
    if (!Number.isFinite(eur) || eur < 0) return;
    const cents = Math.round(eur * 100);
    setSaving(r.id, true);
    setLocal(ls => ls.map(x => x.id === r.id ? { ...x, base_price_cents: cents } : x));
    try {
      await updatePriceCents(r.id, cents);
    } catch (e:any) {
      alert(e?.message || e);
    } finally {
      setSaving(r.id, false);
    }
  }

  async function onDelete(r: CatalogRow) {
    if (!confirm(`Verwijder ${r.brand} ${r.model} ${r.capacity_gb}GB?`)) return;
    setSaving(r.id, true);
    try {
      await deleteRow(r.id);
      setLocal(ls => ls.filter(x => x.id !== r.id));
    } catch (e:any) {
      alert(e?.message || e);
    } finally {
      setSaving(r.id, false);
    }
  }

  async function onAdd() {
    const brand = prompt("Merk (brand):")?.trim();
    if (!brand) return;
    const model = prompt("Model:")?.trim();
    if (!model) return;
    const capStr = prompt("Capaciteit (GB):")?.trim();
    const capacity_gb = Number(capStr);
    if (!Number.isFinite(capacity_gb)) return;

    const priceStr = prompt("Basisprijs (EUR):")?.replace(",", ".").trim() || "0";
    const priceEur = Number(priceStr);
    const base_price_cents = Math.max(0, Math.round((Number.isFinite(priceEur) ? priceEur : 0) * 100));

    setAdding(true);
    try {
      await createRow({
        brand,
        category: selectedCategory ?? null,
        model,
        capacity_gb,
        base_price_cents,
        active: true,
      });
      // UI ververst via server revalidate; we vertrouwen op server navigation refresh door page.tsx
      // Optioneel meteen lokaal bijvoegen
      setLocal(ls => [
        ...ls,
        {
          id: Math.floor(Math.random() * 1e9) * -1, // temp id
          brand,
          category: selectedCategory ?? null,
          model,
          submodel: null,
          variant: null,
          year: null,
          capacity_gb,
          connectivity: null,
          cpu: null,
          ram_gb: null,
          ssd_gb: null,
          base_price_cents,
          image_url: null,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (e:any) {
      alert(e?.message || e);
    } finally {
      setAdding(false);
    }
  }

  async function onUploadForModel(brand: string, model: string) {
    const key = `${brand}__${model}`;
    const input = fileInputs.current[key];
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadModelImageAction(brand, model, file);
      // update alle rijen lokaal die matchen
      setLocal(ls => ls.map(x => (x.brand === brand && x.model === model) ? { ...x, image_url: url } : x));
      input.value = "";
      alert("Afbeelding geüpload voor dit model.");
    } catch (e:any) {
      alert(e?.message || e);
    }
  }

  async function onModelToggleAll(brand: string, model: string, next: boolean) {
    if (!confirm(`Zet ALLE varianten van ${brand} ${model} ${next ? "actief" : "inactief"}?`)) return;
    try {
      await setModelActiveForAll(brand, model, next);
      setLocal(ls => ls.map(x => (x.brand === brand && x.model === model) ? { ...x, active: next } : x));
    } catch (e:any) {
      alert(e?.message || e);
    }
  }

  // Groepeer logische rijen per (brand, model)
  const groups = React.useMemo(() => {
    const m = new Map<string, { brand: string; model: string; rows: CatalogRow[] }>();
    for (const r of local) {
      const k = `${r.brand}__${r.model}`;
      if (!m.has(k)) m.set(k, { brand: r.brand, model: r.model, rows: [] });
      m.get(k)!.rows.push(r);
    }
    return Array.from(m.values()).sort((a,b) => (a.brand+a.model).localeCompare(b.brand+b.model));
  }, [local]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {selectedCategory ? `Modellen in “${selectedCategory}”` : "Alle modellen"}
        </h2>
        <button className={`bb-btn ${adding ? "opacity-60" : ""}`} onClick={onAdd} disabled={adding}>
          + Model toevoegen
        </button>
      </div>

      {/* TABEL */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-gray-600">
              <th className="px-2">Foto</th>
              <th className="px-2">Merk</th>
              <th className="px-2">Model</th>
              <th className="px-2">Variant</th>
              <th className="px-2">Cap. (GB)</th>
              <th className="px-2">Prijs (EUR)</th>
              <th className="px-2">Actief</th>
              <th className="px-2">Del.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              // model header rij met foto upload + toggle ALL
              const sample = g.rows[0];
              const fileKey = `${g.brand}__${g.model}`;
              return (
                <React.Fragment key={fileKey}>
                  <tr>
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 bg-gray-100 border rounded overflow-hidden flex items-center justify-center">
                          {sample.image_url
                            ? <img src={sample.image_url} alt={`${g.brand} ${g.model}`} className="w-full h-full object-contain" />
                            : <span className="text-[10px] text-gray-400">Geen foto</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(el) => { fileInputs.current[fileKey] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                          />
                          <button
                            className="bb-btn"
                            onClick={() => fileInputs.current[fileKey]?.click()}
                          >
                            Upload
                          </button>
                          <button
                            className="bb-btn"
                            onClick={() => onUploadForModel(g.brand, g.model)}
                          >
                            Opslaan
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-medium">{g.brand}</td>
                    <td className="px-2 py-2 font-medium">{g.model}</td>
                    <td className="px-2 py-2 text-sm text-gray-500">—</td>
                    <td className="px-2 py-2 text-sm text-gray-500">—</td>
                    <td className="px-2 py-2 text-sm text-gray-500">—</td>
                    <td className="px-2 py-2">
                      <ModelToggleAll brand={g.brand} model={g.model} anyActive={g.rows.some(r=>r.active)} onToggle={onModelToggleAll} />
                    </td>
                    <td className="px-2 py-2"></td>
                  </tr>

                  {g.rows.map(r => {
                    const saving = !!savingIds[r.id];
                    const eur = (r.base_price_cents || 0) / 100;
                    return (
                      <tr key={r.id} className="bg-white/60">
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1">{r.brand}</td>
                        <td className="px-2 py-1">{r.model}</td>
                        <td className="px-2 py-1">{r.variant ?? "—"}</td>
                        <td className="px-2 py-1">{r.capacity_gb}</td>
                        <td className="px-2 py-1">
                          <input
                            defaultValue={eur.toFixed(2)}
                            className="w-28 border rounded px-2 py-1"
                            onBlur={(e) => onPriceChange(r, e.currentTarget.value)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Slider
                            checked={r.active}
                            disabled={saving}
                            onChange={(v) => onToggle(r, v)}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => onDelete(r)}
                            title="Verwijder"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Slider(props: { checked: boolean; onChange: (v: boolean)=>void; disabled?: boolean }) {
  const { checked, onChange, disabled } = props;
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition
        ${checked ? "bg-green-600" : "bg-gray-300"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition
        ${checked ? "translate-x-5" : "translate-x-1"}`}
      />
    </button>
  );
}

function ModelToggleAll({
  brand, model, anyActive, onToggle,
}: { brand: string; model: string; anyActive: boolean; onToggle: (brand:string, model:string, next:boolean)=>void }) {
  const [val, setVal] = React.useState<boolean>(anyActive);
  React.useEffect(()=>{ setVal(anyActive); },[anyActive]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Model actief?</span>
      <button
        type="button"
        onClick={() => { const n = !val; setVal(n); onToggle(brand, model, n); }}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition
          ${val ? "bg-blue-600" : "bg-gray-300"}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${val ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
