'use client';

import { useState } from 'react';
import { updateLeadInlineAction, deleteLeadAction } from './actions';

type Lead = {
  id: string;
  order_code: string;
  created_at: string;

  model: string | null;
  capacity_gb: number | null;
  variant?: string | null;

  base_price_cents: number | null;
  final_price_cents: number | null;

  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  customer_number: string | null;
  sku: string | null;
  imei_sn: string | null;
  status: 'nieuw' | 'controle_succes' | 'controle_gefaald' | 'afgewerkt'; };

function LeadRow({ lead }: { lead: Lead }) {
  const [form, setForm] = useState({
    first_name: lead.first_name ?? '',
    last_name: lead.last_name ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    customer_number: lead.customer_number ?? '',
    sku: lead.sku ?? '',
    imei_sn: lead.imei_sn ?? '',
    status: lead.status,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canChangeStatus = Boolean(form.sku?.trim() && form.imei_sn?.trim());

  async function save(partial?: Partial<typeof form>) {
    setSaving(true);
    try {
      const payload = { id: lead.id, ...form, ...(partial ?? {}) };
      const updated = await updateLeadInlineAction(payload);
      setForm(prev => ({
        ...prev,
        first_name: updated.first_name ?? '',
        last_name: updated.last_name ?? '',
        email: updated.email ?? '',
        phone: updated.phone ?? '',
        customer_number: updated.customer_number ?? '',
        sku: updated.sku ?? '',
        imei_sn: updated.imei_sn ?? '',
        status: updated.status,
      }));
    } catch (e: any) {
      alert(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm('Lead verwijderen?')) return;
    setDeleting(true);
    try {
      await deleteLeadAction({ id: lead.id });
      // Eenvoudigste: pagina herladen zodat SSR-lijst opnieuw wordt opgehaald
      location.reload();
    } catch (e: any) {
      alert(e?.message ?? 'Verwijderen mislukt');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded border p-3 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input className="input" placeholder="Voornaam"
          value={form.first_name}
          onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
        <input className="input" placeholder="Achternaam"
          value={form.last_name}
          onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
        <input className="input" placeholder="E-mail"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input className="input" placeholder="Telefoon"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />

        <input className="input col-span-2" placeholder="Klantnummer"
          value={form.customer_number}
          onChange={e => setForm(f => ({ ...f, customer_number: e.target.value }))} />

        <input className="input" placeholder="SKU"
          value={form.sku}
          onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />

        <input className="input" placeholder="IMEI (15c) of Serienummer"
          value={form.imei_sn}
          onChange={e => setForm(f => ({ ...f, imei_sn: e.target.value }))} />
      </div>

      <div className="flex items-center gap-2">
        <select className="select" value={form.status}
          disabled={!canChangeStatus || saving}
          onChange={e => setForm(f => ({ ...f, status: e.target.value as Lead['status'] }))}>
          <option value="nieuw">Nieuw</option>
          <option value="controle_succes">Controle succesvol</option>
          <option value="controle_gefaald">Controle gefaald</option>
          <option value="afgewerkt">Afgewerkt</option>
        </select>

        <button className="btn" disabled={saving} onClick={() => save()}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>

        {/* Optioneel: verwijderknop als je deleteLeadAction gebruikt */}
        <button className="btn" disabled={deleting} onClick={onDelete}>
          {deleting ? 'Verwijderen…' : 'Verwijderen'}
        </button>
      </div>
    </div>
  );
}

export default function ClientLeads({ leads }: { leads: Lead[] }) {
  return (
    <div className="space-y-4">
      {leads.map(l => <LeadRow key={l.id} lead={l} />)}
    </div>
  );
}
