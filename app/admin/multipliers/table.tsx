'use client';
import { useMemo, useState, useTransition } from 'react';
import { upsertMultiplier, deleteMultiplier } from './actions';

type Row = {
  model: string;
  question_key: 'functional' | 'screen' | 'housing' | 'battery' | 'eu' | 'icloud';
  option_key: string;
  label?: string | null;
  tip?: string | null;
  multiplier_value: number;
  priority?: number;
  active?: boolean;
};

const Q_OPTIONS: Record<Row['question_key'], string[]> = {
  functional: ['ja', 'neen', 'klein'],
  screen: ['geen', 'klein', 'groot'],
  housing: ['minimaal', 'sporen', 'zwaar'],
  battery: ['100', 'gt85', 'le85', 'unknown'],
  eu: ['yes', 'no'],
  icloud: ['yes', 'no']
};

export default function MultipliersTable({
  rows: initial,
  model,
}: { rows: Row[]; model: string }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const m: Record<string, Row[]> = {};
    for (const r of rows) {
      (m[r.question_key] ??= []).push(r);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || a.option_key.localeCompare(b.option_key));
    }
    return m;
  }, [rows]);

  async function saveRow(next: Row) {
    startTransition(async () => {
      const before = [...rows];
      setRows(rows.map(r =>
        r.model === next.model &&
        r.question_key === next.question_key &&
        r.option_key === next.option_key ? next : r
      ));
      try {
        await upsertMultiplier({
          ...next,
          active: next.active ?? true,
          priority: next.priority ?? 100
        });
      } catch (e: any) {
        alert('Opslaan mislukt: ' + e.message);
        setRows(before);
      }
    });
  }

  async function removeRow(r: Row) {
    if (!confirm(`Verwijder ${r.model} / ${r.question_key} / ${r.option_key}?`)) return;
    startTransition(async () => {
      const before = [...rows];
      setRows(before.filter(x =>
        !(x.model === r.model && x.question_key === r.question_key && x.option_key === r.option_key)
      ));
      try {
        await deleteMultiplier({ model: r.model, question_key: r.question_key, option_key: r.option_key });
      } catch (e: any) {
        alert('Verwijderen mislukt: ' + e.message);
        setRows(before);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Add form */}
      <AddRowForm model={model} onAdd={(row) => setRows(prev => [...prev, row])} />

      {(['functional','screen','housing','battery','eu','icloud'] as Row['question_key'][]).map(section => (
        <section key={section}>
          <h3 className="text-base font-semibold mb-2 capitalize">{section}</h3>
          <div className="overflow-auto border rounded">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border-b w-40">Option</th>
                  <th className="p-2 border-b w-64">Label</th>
                  <th className="p-2 border-b">Tip</th>
                  <th className="p-2 border-b w-28 text-right">Value</th>
                  <th className="p-2 border-b w-20 text-right">Priority</th>
                  <th className="p-2 border-b w-16 text-center">Actief</th>
                  <th className="p-2 border-b w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(groups[section] ?? []).map((r, i) => (
                  <tr key={section + i} className="hover:bg-gray-50">
                    <td className="p-2 border-b text-gray-500">{r.option_key}</td>
                    <td className="p-2 border-b">
                      <input
                        defaultValue={r.label ?? ''}
                        className="border px-2 py-1 rounded w-full"
                        onBlur={e => saveRow({ ...r, label: e.target.value })}
                      />
                    </td>
                    <td className="p-2 border-b">
                      <input
                        defaultValue={r.tip ?? ''}
                        className="border px-2 py-1 rounded w-full"
                        onBlur={e => saveRow({ ...r, tip: e.target.value })}
                      />
                    </td>
                    <td className="p-2 border-b text-right">
                      <input
                        defaultValue={String(r.multiplier_value)}
                        className="border px-2 py-1 rounded w-24 text-right"
                        onBlur={e => {
                          const val = parseFloat(e.target.value.replace(',', '.'));
                          saveRow({ ...r, multiplier_value: isNaN(val) ? 1 : val });
                        }}
                      />
                    </td>
                    <td className="p-2 border-b text-right">
                      <input
                        defaultValue={String(r.priority ?? 100)}
                        className="border px-2 py-1 rounded w-16 text-right"
                        onBlur={e => {
                          const p = parseInt(e.target.value, 10);
                          saveRow({ ...r, priority: isNaN(p) ? 100 : p });
                        }}
                      />
                    </td>
                    <td className="p-2 border-b text-center">
                      <input
                        type="checkbox"
                        defaultChecked={r.active ?? true}
                        onChange={e => saveRow({ ...r, active: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 border-b text-right">
                      <button className="text-red-600" onClick={() => removeRow(r)}>✕</button>
                    </td>
                  </tr>
                ))}
                {(!groups[section] || groups[section].length === 0) && (
                  <tr><td className="p-2 text-gray-500" colSpan={7}>Geen regels voor deze sectie.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {isPending && <div className="text-sm text-gray-500">Opslaan…</div>}
    </div>
  );
}

function AddRowForm({ model, onAdd }: { model: string; onAdd: (r: Row) => void }) {
  const [busy, startTransition] = useTransition();
  const [qk, setQk] = useState<Row['question_key']>('functional');
  const [ok, setOk] = useState<string>('ja');

  const options = Q_OPTIONS[qk];

  function submit(form: FormData) {
    startTransition(async () => {
      const r: Row = {
        model,
        question_key: qk,
        option_key: String(form.get('option_key') || ok),
        label: String(form.get('label') || ''),
        tip: String(form.get('tip') || ''),
        multiplier_value: parseFloat(String(form.get('value') || '1').replace(',', '.')) || 1,
        priority: parseInt(String(form.get('priority') || '100'), 10) || 100,
        active: true
      };
      try {
        await upsertMultiplier(r);
        onAdd(r);
      } catch (e: any) {
        alert('Toevoegen mislukt: ' + e.message);
      }
    });
  }

  return (
    <form action={submit} className="border rounded p-3 bg-white">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500">Model</label>
          <input readOnly value={model} className="border px-2 py-1 rounded bg-gray-100" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Question</label>
          <select
            className="border px-2 py-1 rounded"
            value={qk}
            name="question_key"
            onChange={e => { setQk(e.target.value as Row['question_key']); setOk(Q_OPTIONS[e.target.value as Row['question_key']][0]); }}
          >
            {(['functional','screen','housing','battery','eu','icloud'] as Row['question_key'][]).map(k =>
              <option key={k} value={k}>{k}</option>
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">Option</label>
          <select
            className="border px-2 py-1 rounded"
            name="option_key"
            value={ok}
            onChange={e => setOk(e.target.value)}
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500">Label</label>
          <input name="label" className="border px-2 py-1 rounded w-full" placeholder="bv. Werkt perfect" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500">Tip</label>
          <input name="tip" className="border px-2 py-1 rounded w-full" placeholder="tooltip tekst" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Value</label>
          <input name="value" defaultValue="1" className="border px-2 py-1 rounded w-20 text-right" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Priority</label>
          <input name="priority" defaultValue="100" className="border px-2 py-1 rounded w-16 text-right" />
        </div>
        <button disabled={busy} className="px-3 py-1 rounded bg-black text-white">
          {busy ? 'Toevoegen…' : 'Toevoegen'}
        </button>
      </div>
    </form>
  );
}
