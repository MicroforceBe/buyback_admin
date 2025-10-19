'use client';

import { useState, useMemo } from 'react';
import { updateLeadInlineAction } from './actions';

type Props = {
  id: string;
  customer_number: string | null;
  iban: string | null;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null; // read-only
};

const input = 'bb-input h-9 text-xs px-2 py-1';
const label = 'text-[11px] text-gray-500';
const btn   = 'bb-btn h-8 text-xs px-3';
const danger = 'border-red-400 focus:border-red-500 focus:ring-red-300';

export default function CustomerCell(props: Props) {
  const [open, setOpen] = useState(false);

  // lokale state (optioneel – puur voor UX; server action leest uit form)
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

  const missingCustomerNr = useMemo(() => customerNumber.trim() === '', [customerNumber]);

  return (
    <div className="space-y-1">
      {/* samenvatting + toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">
            {[firstName, lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {phone || '—'} {email ? `• ${email}` : ''}
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

      {/* editor */}
      {open && (
        <form action={updateLeadInlineAction} className="mt-2 flex flex-col gap-1">
          <input type="hidden" name="id" value={props.id} />

          {/* klantnummer (rood als leeg) */}
          <div className="flex flex-col">
            <label className={label}>Klantnummer</label>
            <input
              name="customer_number"
              className={`${input} ${missingCustomerNr ? danger : ''}`}
              value={customerNumber}
              onChange={e => setCustomerNumber(e.target.value)}
              placeholder="Klantnummer"
            />
          </div>

          {/* IBAN */}
          <div className="flex flex-col">
            <label className={label}>IBAN</label>
            <input
              name="iban"
              className={input}
              value={iban}
              onChange={e => setIban(e.target.value)}
              placeholder="IBAN"
            />
          </div>

          {/* Naam */}
          <div className="flex flex-col">
            <label className={label}>Naam</label>
            <input
              name="last_name"
              className={input}
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Naam"
            />
          </div>

          <div className="flex flex-col">
            <label className={label}>Voornaam</label>
            <input
              name="first_name"
              className={input}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Voornaam"
            />
          </div>

          {/* Straat + huisnr (straat breed, nr smal) */}
          <div className="flex flex-col">
            <label className={label}>Straat + huisnr</label>
            <div className="grid gap-1 grid-cols-[minmax(20rem,1fr)_4.5rem]">
              <input
                name="street"
                className={`${input} w-full`}
                value={street}
                onChange={e => setStreet(e.target.value)}
                placeholder="Straat"
              />
              <input
                name="house_number"
                className={`${input} w-full`}
                value={houseNumber}
                onChange={e => setHouseNumber(e.target.value)}
                placeholder="Nr"
              />
            </div>
          </div>

          {/* Postcode, gemeente, land, tel */}
          <div className="flex flex-col">
            <label className={label}>Postcode</label>
            <input
              name="postal_code"
              className={input}
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
              placeholder="Postcode"
            />
          </div>

          <div className="flex flex-col">
            <label className={label}>Gemeente</label>
            <input
              name="city"
              className={input}
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Gemeente"
            />
          </div>

          <div className="flex flex-col">
            <label className={label}>Land</label>
            <input
              name="country"
              className={input}
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder="Land"
            />
          </div>

          <div className="flex flex-col">
            <label className={label}>Tel</label>
            <input
              name="phone"
              className={input}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Telefoon"
            />
          </div>

          {/* Email read-only */}
          <div className="flex flex-col">
            <label className={label}>E-mail (read-only)</label>
            <input
              className={`${input} bg-gray-50`}
              value={email}
              readOnly
            />
          </div>

          <div className="pt-1">
            <button className={btn} type="submit" title="Opslaan" aria-label="Opslaan">
              Opslaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
