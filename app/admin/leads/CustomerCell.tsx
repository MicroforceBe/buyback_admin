'use client';

import { useState } from 'react';
import { updateLeadInlineActionJson } from './actions';

export default function CustomerCell(props: {
  id: string;
  customer_number?: string | null;
  iban?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null; // read-only
}) {
  const [open, setOpen] = useState(false);

  const [customerNumber, setCustomerNumber] = useState(props.customer_number ?? '');
  const [iban, setIban] = useState(props.iban ?? '');
  const [lastName, setLastName] = useState(props.last_name ?? '');
  const [firstName, setFirstName] = useState(props.first_name ?? '');
  const [street, setStreet] = useState(props.street ?? '');
  const [houseNumber, setHouseNumber] = useState(props.house_number ?? '');
  const [postalCode, setPostalCode] = useState(props.postal_code ?? '');
  const [city, setCity] = useState(props.city ?? '');
  const [country, setCountry] = useState(props.country ?? '');
  const [phone, setPhone] = useState(props.phone ?? '');
  const email = props.email ?? '';

  const [saving, setSaving] = useState(false);

  const input = 'bb-input h-8 text-xs px-2 py-1 w-full border rounded';
  const danger = 'border-red-400 focus:ring-red-300';
  const label = 'text-[11px] text-gray-500';
  const btn = 'bb-btn h-8 text-xs px-2 border rounded';

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('id', props.id);
      fd.append('customer_number', customerNumber);
      fd.append('iban', iban);
      fd.append('last_name', lastName);
      fd.append('first_name', firstName);
      fd.append('street', street);
      fd.append('house_number', houseNumber);
      fd.append('postal_code', postalCode);
      fd.append('city', city);
      fd.append('country', country);
      fd.append('phone', phone);
      // email is read-only → niet meesturen
      await updateLeadInlineActionJson(fd);
    } catch (e: any) {
      alert(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const missingCustomerNr = customerNumber.trim() === '';

  return (
    <div className="space-y-1">
      {/* compacte header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {[firstName, lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            Klantnr: {customerNumber || '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
          title={open ? 'Sluiten' : 'Bewerken'}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {/* Volgorde: klantnummer, IBAN, Naam, Voornaam, Straat+Nr, Postcode, Gemeente, Land, Tel, Email (RO) */}
          <div className="flex flex-col">
            <label className={label}>Klantnummer</label>
            <input className={`${input} ${missingCustomerNr ? danger : ''}`}
                   value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="Klantnummer" />
          </div>

          <div className="flex flex-col">
            <label className={label}>IBAN</label>
            <input className={input} value={iban} onChange={e => setIban(e.target.value)} placeholder="IBAN" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Naam</label>
            <input className={input} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Naam" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Voornaam</label>
            <input className={input} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Voornaam" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Straat + huisnr</label>
            <div className="flex gap-1">
              <input className={`${input} flex-1`} value={street} onChange={e => setStreet(e.target.value)} placeholder="Straat" />
              <input className={`${input} w-24`} value={houseNumber} onChange={e => setHouseNumber(e.target.value)} placeholder="Nr" />
            </div>
          </div>

          <div className="flex flex-col">
            <label className={label}>Postcode</label>
            <input className={input} value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="Postcode" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Gemeente</label>
            <input className={input} value={city} onChange={e => setCity(e.target.value)} placeholder="Gemeente" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Land</label>
            <input className={input} value={country} onChange={e => setCountry(e.target.value)} placeholder="Land" />
          </div>

          <div className="flex flex-col">
            <label className={label}>Tel</label>
            <input className={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefoon" />
          </div>

          <div className="flex flex-col">
            <label className={label}>E-mail (read-only)</label>
            <input className={`${input} bg-gray-50`} value={email} readOnly />
          </div>

          <div className="pt-1">
            <button className={btn} onClick={save} disabled={saving}>
              {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
