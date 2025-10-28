'use client';

import { useEffect, useMemo, useState } from 'react';

type Shop = {
  id: string;
  name: string;
  address1?: string | null;
  zip?: string | null;
  city?: string | null;
  opening_hours?: Record<string, string> | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function ShopsSettingsClient() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);

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
                    <td className="py-2 pr-3">
                      {[s.zip, s.city].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {s.opening_hours ? (
                        <code className="text-xs">{shorten(JSON.stringify(s.opening_hours))}</code>
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
    </div>
  );
}

function shorten(s: string, max = 48) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
