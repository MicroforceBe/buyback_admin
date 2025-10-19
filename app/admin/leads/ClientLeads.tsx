'use client';

import { useState } from 'react';
import { updateLeadInlineAction, deleteLeadAction } from './actions';

/** Statuswaarden zoals in je DB/actions */
type Status =
  | 'new'
  | 'received_store'
  | 'label_created'
  | 'shipment_received'
  | 'check_passed'
  | 'check_failed'
  | 'done';

/** Lead-minimum voor deze editor (je mag dit uitbreiden als je meer velden toont) */
type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
  sku: string | null;
  imei_sn: string | null;
  status: Status | null;
};

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  customer_number: string;
  sku: string;
  imei_sn: string;
  status: Status;
};

function LeadRow({ lead }: { lead: Lead }) {
  const [form, setForm] = useState<FormState>({
    first_name: lead.first_name ?? '',
    last_name: lead.last_name ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    customer_number: lead.customer_number ?? '',
    sku: lead.sku ?? '',
    imei_sn: lead.imei_sn ?? '',
    status: (lead.status as Status) ?? 'new',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // UI-gating: status wijzigen pas actief bij SKU + IMEI/SN ingevuld
  const canChangeStatus = Boolean(form.sku?.trim() && form.imei_sn?.trim());

  async function save(partial?: Partial<FormState>) {
    setSaving(true);
    try {
      const p = { ...form, ...(partial ?? {}), id: lead.id };

      // Stuur FormData naar de JSON-variant van je server action
      const fd = new FormData();
      fd.append('id', p.id);
      fd.append('first_name', p.first_name ?? '');
      fd.append('last_name', p.last_name ?? '');
      fd.append('email', p.email ?? '');
      fd.append('phone', p.phone ?? '');
      fd.append('customer_number', p.customer_number ?? '');
      fd.append('sku', p.sku ?? '');
      fd.append('imei_sn', p.imei_sn ?? '');
      fd.append('status', p.status);

      const updated = await updateLeadInlineAction(fd);

      setForm(prev => ({
        ...prev,
        first_name: updated.first_name ?? '',
        last_name: updated.last_name ?? '',
        email: updated.email ?? '',
        phone: updated.phone ?? '',
        customer_number: updated.customer_number ?? '',
        sku: updated.sku ?? '',
        imei_sn: updated.imei_sn ?? '',
        status: updated.status as Status,
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
      const fd = new FormData();
      fd.append('id', lead.id);
      await deleteLeadAction(fd);
      // Eenvoudig: herlaad de pagina zodat SSR-lijst opnieuw wordt opgebouwd
      location.reload();
    } catch (e: any) {
      alert(e?.message ?? 'Verwijderen mislukt');
    } finally {
      setDeleting(false);
    }
  }

  const inputCls = 'bb-input h-9 text-xs px-2 py-1 border rounded';
  const selectCls = 'bb-select h-9 text-xs px-2 py-1 border rounded';
  const btnCls = 'bb-btn h-9 text-xs px-3 border rounded';

  return (
    <div className="rounded border p-3 space-y-2 bg-white">
      {/* Klant- en artikelgegevens */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input
          className={inputCls}
          placeholder="Voornaam"
          value={form.first_name}
          onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Achternaam"
          value={form.last_name}
          onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="E-mail"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Telefoon"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
        />
        <input
          className={`${inputCls} col-span-2`}
          placeholder="Klantnummer"
          value={form.customer_number}
          onChange={e => setForm(f => ({ ...f, customer_number: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="SKU"
          value={form.sku}
          onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="IMEI (15c) of Serienummer"
          value={form.imei_sn}
          onChange={e => setForm(f => ({ ...f, imei_sn: e.target.value }))}
        />
      </div>

      {/* Status + acties */}
      <div className="flex items-center gap-2">
        <select
          className={selectCls}
          value={form.status}
          disabled={!canChangeStatus || saving}
          onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
          title={!canChangeStatus ? 'Vul eerst SKU en IMEI/SN in' : 'Status wijzigen'}
        >
          <option value="new">Nieuw</option>
          <option value="received_store">Ontvangen in winkel</option>
          <option value="label_created">Verzendlabel aangemaakt</option>
          <option value="shipment_received">Zending ontvangen</option>
          <option value="check_passed">Controle succesvol</option>
          <option value="check_failed">Controle gefaald</option>
          <option value="done">Afgewerkt</option>
        </select>

        <button className={btnCls} disabled={saving} onClick={() => save()}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>

        <button className={`${btnCls} border-red-300 text-red-700`} disabled={deleting} onClick={onDelete}>
          {deleting ? 'Verwijderen…' : 'Verwijderen'}
        </button>
      </div>
    </div>
  );
}

/** Lijstcomponent */
export default function ClientLeads({ leads }: { leads: Lead[] }) {
  if (!leads || leads.length === 0) {
    return <div className="p-4 text-sm text-gray-600">Geen leads gevonden.</div>;
    }
  return (
    <div className="space-y-4">
      {leads.map(l => (
        <LeadRow key={l.id} lead={l} />
      ))}
    </div>
  );
}
