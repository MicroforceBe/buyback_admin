'use client';
import { useState, useTransition } from 'react';
import { upsertTip, deleteTip } from './actions';

type Row = {
  model: string;
  tip_key: TipKey;
  tip: string;
};
type TipKey =
  | 'ship_opzenden'
  | 'ship_binnenbrengen'
  | 'store_gentbrugge'
  | 'store_antwerpen'
  | 'store_oudenaarde'
  | 'pay_bank'
  | 'pay_voucher';

const TIP_OPTIONS: { key: TipKey; label: string }[] = [
  { key: 'ship_opzenden', label: 'Opzenden (ship_opzenden)' },
  { key: 'ship_binnenbrengen', label: 'Binnenbrengen (ship_binnenbrengen)' },
  { key: 'store_gentbrugge', label: 'Store Gentbrugge' },
  { key: 'store_antwerpen', label: 'Store Antwerpen' },
  { key: 'store_oudenaarde', label: 'Store Oudenaarde' },
  { key: 'pay_bank', label: 'Betaling via bank' },
  { key: 'pay_voucher', label: 'Betaling via voucher' }
];

export default function TipsTable({ rows: initial, model }: { rows: Row[]; model: string }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, startTransition] = useTransition();

  function existingKeys(): TipKey[] {
    return rows.map(r => r.tip_key);
  }

  async function saveRow(next: Row) {
    startTransition(async () => {
      const before = [...rows];
      setRows(rows.map(r => (r.tip_key === next.tip_key ? next : r)));
      try {
        await upsertTip(next);
      } catch (e: any) {
        alert('Opslaan mislukt: ' + e.message);
        setRows(before);
      }
    });
  }

  async function removeRow(r: Row) {
    if (!confirm(`Verwijder tip: ${r.tip_key}?`)) return;
    startTransition(async () => {
      const before = [...rows];
      setRows(before.filter(x => x.tip_key !== r.tip_key));
      try {
        await deleteTip({ model: r.model, tip_key: r.tip_key });
      } catch (e: any) {
        alert('Verwijderen mislukt: ' + e.message);
        setRows(before);
      }
    });
  }

  async function addRow(form: FormData) {
    startTransition(async () => {
      const tip_key = String(form.get('tip_key')) as TipKey;
      const tip = String(form.get('tip') || '');
      const row: Row = { model, tip_key, tip };
      try {
        await upsertTip(row);
        setRows(prev => {
          const exists = prev.find(p => p.tip_key === tip_key);
          return exists ? prev.map(p => (p.tip_key === tip_key ? row : p)) : [...prev, row];
        });
      } catch (e: any) {
        alert('Toevoegen mislukt: ' + e.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Add/replace form */}
      <form action={addRow} className="border rounded p-3 bg-white">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Model</label>
            <input readOnly value={model} className="border px-2 py-1 rounded bg-gray-100" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Tip key</label>
            <select name="tip_key" className="border px-2 py-1 rounded">
              {TIP_OPTIONS.map(o => (
                <option key={o.key} value={o.key} disabled={existingKeys().includes(o.key)}>
                  {o.label}{existingKeys().includes(o.key) ? ' (bestaat)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[320px]">
            <label className="block text-xs text-gray-500">Tip tekst</label>
            <input name="tip" className="border px-2 py-1 rounded w-full" placeholder="bv. Wij betalen binnen 48u na ontvangst." />
          </div>
          <button className="px-3 py-1 rounded bg-black text-white" disabled={busy}>
            {busy ? 'Opslaan…' : 'Opslaan/Toevoegen'}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-auto border rounded">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border-b w-56">Tip key</th>
              <th className="p-2 border-b">Tip</th>
              <th className="p-2 border-b w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => a.tip_key.localeCompare(b.tip_key))
              .map((r) => (
                <tr key={r.tip_key} className="hover:bg-gray-50">
                  <td className="p-2 border-b text-gray-500">{r.tip_key}</td>
                  <td className="p-2 border-b">
                    <input
                      defaultValue={r.tip}
                      className="border px-2 py-1 rounded w-full"
                      onBlur={e => saveRow({ ...r, tip: e.target.value })}
                    />
                  </td>
                  <td className="p-2 border-b text-right">
                    <button className="text-red-600" onClick={() => removeRow(r)}>✕</button>
                  </td>
                </tr>
              ))}
            {rows.length === 0 && (
              <tr><td className="p-2 text-gray-500" colSpan={3}>Nog geen tips voor dit model.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {busy && <div className="text-sm text-gray-500">Bezig…</div>}
    </div>
  );
}
