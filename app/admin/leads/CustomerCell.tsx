'use client';

import { useState } from 'react';
import { updateLeadInlineActionJson } from './actions';

export default function CustomerCell(props: {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_number?: string | null;
}) {
  const [firstName, setFirstName] = useState(props.first_name ?? '');
  const [lastName, setLastName] = useState(props.last_name ?? '');
  const [email, setEmail] = useState(props.email ?? '');
  const [phone, setPhone] = useState(props.phone ?? '');
  const [customerNumber, setCustomerNumber] = useState(props.customer_number ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('id', props.id);
      fd.append('first_name', firstName);
      fd.append('last_name', lastName);
      fd.append('email', email);
      fd.append('phone', phone);
      fd.append('customer_number', customerNumber);
      const updated = await updateLeadInlineActionJson(fd);
      setFirstName(updated.first_name ?? '');
      setLastName(updated.last_name ?? '');
      setEmail(updated.email ?? '');
      setPhone(updated.phone ?? '');
      setCustomerNumber(updated.customer_number ?? '');
    } catch (e: any) {
      alert(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'bb-input h-8 text-xs px-2 py-1 w-full border rounded';
  const btnCls = 'bb-btn h-8 text-xs px-2 border rounded';

  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">
        {[firstName, lastName].filter(Boolean).join(' ') || '—'}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">Voornaam</label>
          <input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Voornaam" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">Achternaam</label>
          <input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Achternaam" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">E-mail</label>
          <input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">Telefoon</label>
          <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefoon" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">Klantnummer</label>
          <input className={inputCls} value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="Klantnummer" />
        </div>
        <div>
          <button className={btnCls} onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
