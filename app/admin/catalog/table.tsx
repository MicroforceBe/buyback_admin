// app/admin/catalog/table.tsx
'use client';

import React, { useMemo, useRef, useState } from 'react';
import { updateModelRowAction, uploadModelImageAction, type ModelRow } from './actions';

export default function CatalogTable({ rows, query = '' }: { rows: ModelRow[]; query?: string }) {
  const [editing, setEditing] = useState<Record<string, ModelRow>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.model.toLowerCase().includes(q) ||
      (r.brand ?? '').toLowerCase().includes(q) ||
      (r.variant ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  function startEdit(row: ModelRow) {
    setEditing((prev) => ({ ...prev, [row.id]: { ...row } }));
    setErrors((prev) => ({ ...prev, [row.id]: null }));
  }
  function cancelEdit(id: string) {
    setEditing((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
    setErrors((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
  }
  function setField<K extends keyof ModelRow>(rowId: string, key: K, value: ModelRow[K]) {
    setEditing((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] ?? {} as ModelRow), [key]: value } }));
  }

  async function onSaveRow(e: React.FormEvent<HTMLFormElement>, rowId: string) {
    e.preventDefault();
    setErrors((p) => ({ ...p, [rowId]: null }));
    const draft = editing[rowId];
    if (!draft) return;
    try {
      setSaving((s) => ({ ...s, [rowId]: true }));
      const fd = new FormData();
      fd.set('id', draft.id);
      fd.set('model', draft.model || '');
      fd.set('brand', draft.brand || '');
      fd.set('variant', draft.variant || '');
      fd.set('capacity_gb', draft.capacity_gb == null ? '' : String(draft.capacity_gb));
      fd.set('price_eur', draft.price_cents == null ? '' : (draft.price_cents / 100).toFixed(2));
      fd.set('active', draft.active ? 'true' : 'false');
      await updateModelRowAction(fd);
      cancelEdit(rowId);
    } catch (err: any) {
      setErrors((p) => ({ ...p, [rowId]: err?.message || 'Bewaren mislukt' }));
    } finally {
      setSaving((s) => ({ ...s, [rowId]: false }));
    }
  }

  function pickImage(rowId: string) {
    const input = fileInputs.current[rowId];
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function onFilePicked(row: ModelRow, file: File | null) {
    if (!file) return;
    const id = row.id;
    try {
      setSaving((s) => ({ ...s, [id]: true }));
      const fd = new FormData();
      fd.set('row_id', id);
      fd.set('file', file);
      await uploadModelImageAction(fd);
      // geen error tonen
    } catch (err: any) {
      setErrors((p) => ({ ...p, [id]: err?.message || 'Upload mislukt' }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="bb-card p-0 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Model</th>
            <th className="px-3 py-2 text-left">Brand</th>
            <th className="px-3 py-2 text-left">Variant</th>
            <th className="px-3 py-2 text-left">GB</th>
            <th className="px-3 py-2 text-left">Prijs (€)</th>
            <th className="px-3 py-2 text-left">Afbeelding</th>
            <th className="px-3 py-2 text-left">Actief</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filtered.map((m: ModelRow) => {
            const isEditing = !!editing[m.id];
            const row = isEditing ? editing[m.id] : m;
            const isSaving = !!saving[m.id];
            const err = errors[m.id] ?? null;

            return (
              <tr key={m.id} className="hover:bg-gray-50/70">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input className="w-44 bb-input" value={row.model} onChange={(e) => setField(m.id, 'model', e.target.value)} />
                  ) : (
                    <div className="font-medium">{row.model}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input className="w-36 bb-input" value={row.brand ?? ''} onChange={(e) => setField(m.id, 'brand', e.target.value)} />
                  ) : <span className="text-gray-600">{row.brand || '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input className="w-36 bb-input" value={row.variant ?? ''} onChange={(e) => setField(m.id, 'variant', e.target.value)} />
                  ) : <span className="text-gray-700">{row.variant || '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input type="number" className="w-24 bb-input"
                      value={row.capacity_gb ?? ''}
                      onChange={(e) => setField(m.id, 'capacity_gb', e.target.value === '' ? null : Number(e.target.value))} />
                  ) : <span>{row.capacity_gb ?? '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input type="number" className="w-28 bb-input"
                      value={row.price_cents != null ? (row.price_cents / 100).toFixed(2) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const cents = v === '' ? null : Math.round(Number(v.replace(',', '.')) * 100);
                        setField(m.id, 'price_cents', cents as any);
                      }} />
                  ) : <span>{row.price_cents != null ? (row.price_cents / 100).toFixed(2) : '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-9 border bg-white rounded overflow-hidden flex items-center justify-center">
                      {row.image_url ? (
                        <img src={row.image_url} alt={row.model} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">geen</span>
                      )}
                    </div>

                    {/* Hidden file input per rij */}
                    <div>
                      <input
                        ref={(el) => { fileInputs.current[m.id] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onFilePicked(m, e.currentTarget.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
                        onClick={() => pickImage(m.id)}
                        disabled={isSaving}
                      >
                        {row.image_url ? 'Wijzig' : 'Upload'}
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={!!row.active}
                        onChange={(e) => setField(m.id, 'active', e.target.checked)}
                      />
                      <span className="w-10 h-5 bg-gray-300 peer-checked:bg-green-600 rounded-full relative transition-colors">
                        <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                      </span>
                      <span className="ml-2 text-xs text-gray-600">{row.active ? 'Actief' : 'Inactief'}</span>
                    </label>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {row.active ? 'Actief' : 'Inactief'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
                  {isEditing ? (
                    <form onSubmit={(e) => onSaveRow(e, m.id)} className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50"
                        onClick={() => cancelEdit(m.id)}
                        disabled={isSaving}
                      >
                        Annuleren
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-sm rounded border border-green-600 text-white"
                        style={{ background: 'var(--bb-accent, #16a34a)' }}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Bewaren…' : 'Bewaren'}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50"
                      onClick={() => startEdit(m)}
                    >
                      Bewerken
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">Geen resultaten.</td>
            </tr>
          )}
        </tbody>
      </table>

      <style jsx global>{`
        .bb-input {
          @apply border rounded px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-green-200 focus:border-green-600;
        }
        .bb-card { @apply rounded border bg-white; }
      `}</style>
    </div>
  );
}
