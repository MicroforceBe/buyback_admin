'use client';

import { useEffect, useMemo, useState } from 'react';
import HoursEditor, { type OpeningHours } from './HoursEditor';

type Shop = {
  id: string;
  name: string;
  address1?: string | null;
  zip?: string | null;
  city?: string | null;
  opening_hours?: OpeningHours | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  id?: string | null; // aanwezig = edit
  name: string;
  address1: string;
  zip: string;
  city: string;
  active: boolean;
  opening_hours: OpeningHours;
};

type Props = {
  canEdit: boolean;
};

const EMPTY_HOURS: OpeningHours = {
  mon: '09:00-18:00',
  tue: '09:00-18:00',
  wed: '09:00-18:00',
  thu: '09:00-18:00',
  fri: '09:00-18:00',
  sat: '',
  sun: '',
};

const emptyForm = (): FormState => ({
  id: null,
  name: '',
  address1: '',
  zip: '',
  city: '',
  active: true,
  opening_hours: { ...EMPTY_HOURS },
});

export default function ShopsSettingsClient({ canEdit }: Props) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // formulier
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  // zoeken/filteren
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/buyback/shops', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const list: Shop[] = Array.isArray(j?.shops) ? j.shops : (Array.isArray(j) ? j : []);
      setShops(list);
    } catch (e: any) {
      setErr(e?.message || 'Kon winkels niet laden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return shops;
    return shops.filter(s =>
      s.name.toLowerCase().includes(needle) ||
      (s.city || '').toLowerCase().includes(needle) ||
      (s.zip || '').toLowerCase().includes(needle) ||
      (s.address1 || '').toLowerCase().includes(needle)
    );
  }, [q, shops]);

  function startCreate() {
    setForm(emptyForm());
    setOk(null);
    setErr(null);
  }

  function startEdit(s: Shop) {
    setForm({
      id: s.id,
      name: s.name || '',
      address1: s.address1 || '',
      zip: s.zip || '',
      city: s.city || '',
      active: !!s.active,
      opening_hours: s.opening_hours || {},
    });
    setOk(null);
    setErr(null);
    scrollToForm();
  }

  function cancelEdit() {
    setForm(emptyForm());
    setOk(null);
    setErr(null);
  }

  function scrollToForm() {
    try {
      const el = document.getElementById('shop-form-top');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}
  }

  async function save() {
    if (!form.name.trim()) {
      setErr('Naam is verplicht');
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = {
        name: form.name.trim(),
        address1: form.address1.trim() || null,
        zip: form.zip.trim() || null,
        city: form.city.trim() || null,
        opening_hours: form.opening_hours,
        active: !!form.active,
      };

      if (form.id) {
        // update
        const r = await fetch(`/api/buyback/shops/${form.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setOk('Winkel bijgewerkt.');
      } else {
        // create
        const r = await fetch('/api/buyback/shops', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setOk('Winkel toegevoegd.');
      }
      await load();
      setForm(emptyForm());
    } catch (e: any) {
      setErr(e?.message || 'Onbekende fout bij bewaren');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Shop) {
    try {
      // optimistisch
      setShops(prev => prev.map(x => x.id === s.id ? { ...x, active: !x.active } : x));
      const r = await fetch(`/api/buyback/shops/${s.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !s.active }),
      });
      if (!r.ok) {
        // rollback bij fout
        setShops(prev => prev.map(x => x.id === s.id ? { ...x, active: s.active } : x));
      }
    } catch {
      // rollback bij fout
      setShops(prev => prev.map(x => x.id === s.id ? { ...x, active: s.active } : x));
    }
  }

  async function remove(s: Shop) {
    const sure = confirm(`Verwijder winkel “${s.name}”?`);
    if (!sure) return;
    try {
      const r = await fetch(`/api/buyback/shops/${s.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setShops(prev => prev.filter(x => x.id !== s.id));
      // als je die net aan het editen was, reset form
      if (form.id === s.id) setForm(emptyForm());
    } catch (e: any) {
      alert(e?.message || 'Verwijderen mislukt');
    }
  }

  const isEditing = !!form.id;

  return (
    <div className="space-y-6">
      {/* Header + zoeker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Shops</h2>
          <p className="text-sm text-gray-500">Beheer winkels voor “Binnenbrengen in winkel”.</p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Zoek op naam, gemeente, postcode…"
            className="border rounded px-3 py-2 w-64"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100"
            onClick={() => { setQ(''); load(); }}
            title="Vernieuwen"
          >
            Vernieuwen
          </button>
        </div>
      </div>

      {/* Formulier: create / edit */}
      <div id="shop-form-top" className="rounded border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">
            {isEditing ? 'Winkel bewerken' : 'Nieuwe winkel toevoegen'}
          </div>
          {isEditing && (
            <button className="text-sm underline" onClick={cancelEdit}>
              Annuleren
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">Naam *</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm(s => ({ ...s, name: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Adres</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.address1}
              onChange={(e) => setForm(s => ({ ...s, address1: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Postcode</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.zip}
              onChange={(e) => setForm(s => ({ ...s, zip: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Gemeente</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.city}
              onChange={(e) => setForm(s => ({ ...s, city: e.target.value }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              className="accent-green-600"
              checked={form.active}
              onChange={(e) => setForm(s => ({ ...s, active: e.target.checked }))}
            />
            Actief
          </label>
        </div>

        <div className="mt-4">
          <div className="font-medium mb-2">Openingstijden</div>
          <HoursEditor
            value={form.opening_hours}
            onChange={(next) => setForm(s => ({ ...s, opening_hours: next }))}
            className="rounded border bg-white p-3"
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className={`px-4 py-2 rounded border ${saving ? 'opacity-60 cursor-not-allowed' : 'bg-gray-50 hover:bg-gray-100'}`}
            onClick={save}
            disabled={saving || !form.name.trim()}
          >
            {saving ? (isEditing ? 'Bijwerken…' : 'Bewaren…') : (isEditing ? 'Bijwerken' : 'Bewaren')}
          </button>
          {ok && <span className="text-green-700 text-sm">{ok}</span>}
          {err && <span className="text-red-700 text-sm">{err}</span>}
        </div>
      </div>

      {/* Lijst */}
      <div className="rounded border bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-medium">Winkels</div>
          <button className="text-sm underline" onClick={startCreate}>
            Nieuwe winkel
          </button>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Laden…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Geen winkels gevonden.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 border-b">Naam</th>
                  <th className="px-3 py-2 border-b">Adres</th>
                  <th className="px-3 py-2 border-b">Postcode</th>
                  <th className="px-3 py-2 border-b">Gemeente</th>
                  <th className="px-3 py-2 border-b">Actief</th>
                  <th className="px-3 py-2 border-b text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b font-medium">{s.name}</td>
                    <td className="px-3 py-2 border-b">{s.address1 || '—'}</td>
                    <td className="px-3 py-2 border-b">{s.zip || '—'}</td>
                    <td className="px-3 py-2 border-b">{s.city || '—'}</td>
                    <td className="px-3 py-2 border-b">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-green-600"
                          checked={!!s.active}
                          onChange={() => toggleActive(s)}
                        />
                        <span className="text-xs text-gray-600">{s.active ? 'Actief' : 'Inactief'}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2 border-b text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="px-2 py-1 rounded border bg-white hover:bg-gray-100"
                          onClick={() => startEdit(s)}
                        >
                          Bewerk
                        </button>
                        <button
                          className="px-2 py-1 rounded border bg-white hover:bg-gray-100"
                          onClick={() => alert(formatHoursPreview(s.opening_hours))}
                          title="Openingstijden bekijken"
                        >
                          Uren
                        </button>
                        <button
                          className="px-2 py-1 rounded border bg-white hover:bg-red-50 text-red-700"
                          onClick={() => remove(s)}
                        >
                          Verwijder
                        </button>
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

/* Kleine helper om openingstijden leesbaar te tonen */
function formatHoursPreview(hours?: OpeningHours | null) {
  if (!hours) return 'Geen openingstijden ingesteld.';
  const map: Record<string,string> = {
    mon: 'Maandag', tue: 'Dinsdag', wed: 'Woensdag',
    thu: 'Donderdag', fri: 'Vrijdag', sat: 'Zaterdag', sun: 'Zondag'
  };
  const lines = Object.entries(hours).map(([k,v]) => `${map[k] || k}: ${v || '—'}`);
  return lines.join('\n');
}
