'use client';

import { useEffect, useMemo, useState } from 'react';

type Shop = {
  id: string;
  name: string;
  address1?: string | null;
  zip?: string | null;
  city?: string | null;
  opening_hours?: Record<string, string> | null; // bv. { mon:"09:00-18:00", ... }
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const DAYS_ORDER = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABEL: Record<string,string> = {
  mon: 'Maandag',
  tue: 'Dinsdag',
  wed: 'Woensdag',
  thu: 'Donderdag',
  fri: 'Vrijdag',
  sat: 'Zaterdag',
  sun: 'Zondag',
};

export default function ShopsSettingsClient() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [viewHours, setViewHours] = useState<Shop | null>(null); // ← NEW

  const [form, setForm] = useState({
    name: '',
    address1: '',
    zip: '',
    city: '',
    opening_hours_raw: '' as string, // JSON als tekst
    active: true,
  });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/buyback/shops', { cache: 'no-store' });
      const j = await r.json();
      setShops(Array.isArray(j?.shops) ? j.shops : []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditing(null);
    setForm({ name: '', address1: '', zip: '', city: '', opening_hours_raw: '', active: true });
  }

  async function handleCreateOrUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return alert('Naam is vereist');

    let opening_hours: any = {};
    if (form.opening_hours_raw.trim()) {
      try { opening_hours = JSON.parse(form.opening_hours_raw); }
      catch { return alert('Openingstijden: geen geldige JSON'); }
    }

    setSaving(true);
    try {
      if (editing) {
        const r = await fetch(`/api/buyback/shops/${editing.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            address1: form.address1,
            zip: form.zip,
            city: form.city,
            opening_hours,
            active: form.active,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
      } else {
        const r = await fetch('/api/buyback/shops', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            address1: form.address1,
            zip: form.zip,
            city: form.city,
            opening_hours,
            active: form.active,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
      }
      await load();
      resetForm();
    } catch (e:any) {
      alert(`Bewaren mislukt: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s: Shop) {
    setEditing(s);
    setForm({
      name: s.name || '',
      address1: s.address1 || '',
      zip: s.zip || '',
      city: s.city || '',
      opening_hours_raw: s.opening_hours ? JSON.stringify(s.opening_hours, null, 2) : '',
      active: !!s.active,
    });
  }

  async function toggleActive(s: Shop) {
    try {
      const r = await fetch(`/api/buyback/shops/${s.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      });
      if (!r.ok) throw new Error('Kon status niet aanpassen');
      await load();
    } catch (e:any) {
      alert(e?.message || String(e));
    }
  }

  async function handleDelete(s: Shop) {
    if (!confirm(`Verwijder winkel "${s.name}"?`)) return;
    try {
      const r = await fetch(`/api/buyback/shops/${s.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Kon winkel niet verwijderen');
      await load();
    } catch (e:any) {
      alert(e?.message || String(e));
    }
  }

  const activeCount = useMemo(() => shops.filter(s => s.active).length, [shops]);

  return (
    <div className="space-y-6">
      {/* Formulier */}
      <form onSubmit={handleCreateOrUpdate} className="bb-card p-4 space-y-3">
        <div className="font-medium">{editing ? 'Winkel bewerken' : 'Nieuwe winkel toevoegen'}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">Naam*</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Actief</span>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={form.active ? '1' : '0'}
              onChange={(e) => setForm(f => ({ ...f, active: e.target.value === '1' }))}
            >
              <option value="1">Ja</option>
              <option value="0">Nee</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="text-xs text-gray-500">Adres</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.address1}
              onChange={(e) => setForm(f => ({ ...f, address1: e.target.value }))}
              placeholder="Straat + nr"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Postcode</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.zip}
              onChange={(e) => setForm(f => ({ ...f, zip: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Gemeente</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.city}
              onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="text-xs text-gray-500">Openingstijden (JSON)</span>
            <textarea
              className="w-full border rounded px-3 py-2 font-mono text-xs min-h-[110px]"
              value={form.opening_hours_raw}
              onChange={(e) => setForm(f => ({ ...f, opening_hours_raw: e.target.value }))}
              placeholder={`{ "mon": "09:00-18:00", "sat": "10:00-17:00" }`}
            />
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          {editing && (
            <button type="button" className="bb-btn" onClick={resetForm}>
              Annuleren
            </button>
          )}
          <button
            type="submit"
            className={`bb-btn border is-active ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={saving}
          >
            {saving ? 'Bewaren…' : (editing ? 'Wijzigingen bewaren' : 'Toevoegen')}
          </button>
        </div>
      </form>

      {/* Overzicht */}
      <div className="bb-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Winkels</div>
          <div className="text-xs text-gray-500">
            Actief: {activeCount} / {shops.length}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Laden…</div>
        ) : shops.length === 0 ? (
          <div className="text-sm text-gray-500">Nog geen winkels toegevoegd.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-3">Naam</th>
                  <th className="py-2 pr-3">Adres</th>
                  <th className="py-2 pr-3">Plaats</th>
                  <th className="py-2 pr-3">Opening</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {shops.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="py-2 pr-3 font-medium">{s.name}</td>
                    <td className="py-2 pr-3">{s.address1 || '—'}</td>
                    <td className="py-2 pr-3">{[s.zip, s.city].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-2 pr-3">
                      {s.opening_hours ? (
                        <span className="text-xs">
                          {formatShortHours(s.opening_hours)}
                          {' · '}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setViewHours(s)} // ← OPEN DIALOG
                          >
                            Bekijk
                          </button>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${s.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {s.active ? 'Actief' : 'Inactief'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button className="bb-btn" onClick={() => startEdit(s)}>Bewerken</button>
                        <button className="bb-btn" onClick={() => toggleActive(s)}>
                          {s.active ? 'Deactiveer' : 'Activeer'}
                        </button>
                        <button className="bb-btn" onClick={() => handleDelete(s)}>Verwijderen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* === Openingstijden dialoog === */}
      {viewHours && (
        <HoursDialog
          shop={viewHours}
          onClose={() => setViewHours(null)}
        />
      )}
    </div>
  );
}

/* Helpers */
function shorten(s: string, max = 48) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function formatShortHours(hours?: Record<string,string> | null) {
  if (!hours) return '—';
  const keys = DAYS_ORDER.filter(k => hours[k]);
  if (!keys.length) return '—';
  // Toon bijv. "Ma–Vr 09:00-18:00, Za 10:00-17:00"
  const groups: string[] = [];
  let i = 0;
  while (i < DAYS_ORDER.length) {
    const k = DAYS_ORDER[i];
    if (!hours[k]) { i++; continue; }
    const spanStart = i;
    const time = hours[k];
    let j = i + 1;
    while (j < DAYS_ORDER.length && hours[DAYS_ORDER[j]] === time) j++;
    const label = spanLabel(spanStart, j - 1);
    groups.push(`${label} ${time}`);
    i = j;
  }
  return groups.join(', ');
}
function spanLabel(startIdx: number, endIdx: number) {
  const names = DAYS_ORDER.map(d => DAY_LABEL[d]);
  return startIdx === endIdx ? names[startIdx] : `${names[startIdx].slice(0,2)}–${names[endIdx].slice(0,2)}`;
}

/* === Dialoog component === */
function HoursDialog({ shop, onClose }: { shop: Shop; onClose: () => void }) {
  const h = shop.opening_hours || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Openingstijden — {shop.name}</div>
          <button className="bb-btn" onClick={onClose}>Sluiten</button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {DAYS_ORDER.map(k => (
              <tr key={k} className="border-t">
                <td className="py-2 pr-3 text-gray-600">{DAY_LABEL[k]}</td>
                <td className="py-2">{h[k] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shop.address1 || shop.city ? (
          <div className="mt-3 text-xs text-gray-500">
            {shop.address1 || ''}{shop.address1 && (shop.zip || shop.city) ? ', ' : ''}{[shop.zip, shop.city].filter(Boolean).join(' ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
