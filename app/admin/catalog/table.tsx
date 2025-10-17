'use client';
import { useState, useTransition } from 'react';
import { upsertCatalogRow, deleteCatalogRow } from './actions';

type Row = {
  brand: string;
  model: string;
  variant?: string | null;
  capacity_gb: number;
  base_price_cents: number;
  active?: boolean;
};

export default function CatalogTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [isPending, startTransition] = useTransition();

  async function onSave(updated: Row) {
    startTransition(async () => {
      const before = [...rows];
      setRows(rows.map(r =>
        r.brand === updated.brand &&
        r.model === updated.model &&
        r.capacity_gb === updated.capacity_gb &&
        (r.variant ?? '') === (updated.variant ?? '')
          ? updated
          : r
      ));
      try {
        await upsertCatalogRow(updated);
      } catch (e: any) {
        alert('Fout bij opslaan: ' + e.message);
        setRows(before);
      }
    });
  }

  async function onDelete(r: Row) {
    if (!confirm(`Verwijder ${r.brand} ${r.model} ${r.capacity_gb} GB?`)) return;
    startTransition(async () => {
      const before = [...rows];
      setRows(before.filter(x => x !== r));
      try {
        await deleteCatalogRow(r);
      } catch (e: any) {
        alert('Fout bij verwijderen: ' + e.message);
        setRows(before);
      }
    });
  }

  return (
    <div className="overflow-auto border rounded">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border-b">Brand</th>
            <th className="p-2 border-b">Model</th>
            <th className="p-2 border-b">Variant</th>
            <th className="p-2 border-b">GB</th>
            <th className="p-2 border-b">Prijs (€)</th>
            <th className="p-2 border-b">Actief</th>
            <th className="p-2 border-b"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="p-2 border-b">{r.brand}</td>
              <td className="p-2 border-b">{r.model}</td>
              <td className="p-2 border-b">
                <input
                  defaultValue={r.variant ?? ''}
                  className="border px-2 py-1 rounded w-full"
                  onBlur={e => onSave({ ...r, variant: e.target.value })}
                />
              </td>
              <td className="p-2 border-b text-right">{r.capacity_gb}</td>
              <td className="p-2 border-b text-right">
                <input
                  defaultValue={(r.base_price_cents / 100).toFixed(2)}
                  className="border px-2 py-1 rounded w-20 text-right"
                  onBlur={e => {
                    const cents = Math.round(parseFloat(e.target.value.replace(',', '.')) * 100) || 0;
                    onSave({ ...r, base_price_cents: cents });
                  }}
                />
              </td>
              <td className="p-2 border-b text-center">
                <input
                  type="checkbox"
                  defaultChecked={r.active ?? true}
                  onChange={e => onSave({ ...r, active: e.target.checked })}
                />
              </td>
              <td className="p-2 border-b text-right">
                <button className="text-red-600" onClick={() => onDelete(r)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isPending && <div className="p-2 text-sm text-gray-500">Opslaan…</div>}
    </div>
  );
}
