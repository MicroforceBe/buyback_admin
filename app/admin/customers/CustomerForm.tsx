'use client';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { customerCountries, customerTypes, type Customer, type CustomerType } from '@/lib/customers';
import { createCustomer, updateCustomer, type CustomerSaveResult } from './actions';
import styles from './customers.module.css';

type Shop = { id: string; name: string };
type Failure = Extract<CustomerSaveResult, { ok: false }>;

export default function CustomerForm({ customer, shops }: { customer?: Customer; shops: Shop[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<CustomerType>(customer?.customer_type ?? 'private');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(confirmDuplicate: boolean) {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    if (confirmDuplicate) data.set('confirm_duplicate', '1');
    setFailure(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = customer ? await updateCustomer(data) : await createCustomer(data);
        if (!result.ok) { setFailure(result); return; }
        if (customer) { setSaved(true); router.refresh(); }
        else router.push('/admin/customers/' + result.id + '?created=1');
      } catch {
        setFailure({ ok: false, error: 'Opslaan is niet gelukt. Controleer je sessie en probeer opnieuw.' });
      }
    });
  }

  const invalid = (field: string) => (failure?.field === field ? { 'aria-invalid': true as const, 'aria-describedby': 'customer-form-error' } : {});
  const fieldError = (field: string) => failure?.field === field && <span className={styles.fieldError}>{failure.error}</span>;

  return (
    <form ref={formRef} className={styles.form} onSubmit={e => { e.preventDefault(); submit(false); }} noValidate key={customer?.version}>
      {customer && <><input type="hidden" name="id" value={customer.id} /><input type="hidden" name="version" value={customer.version} /></>}

      <div className={styles.section}>
        <h2>Klanttype</h2>
        <p>Bedrijfsklanten krijgen een btw-nummer; facturen aan bedrijven gaan later via Peppol uit het boekhoudpakket.</p>
        <div className={styles.typeSwitch} role="radiogroup" aria-label="Klanttype">
          {(Object.keys(customerTypes) as CustomerType[]).map(value => (
            <label key={value}>
              <input type="radio" name="customer_type" value={value} checked={type === value} onChange={() => setType(value)} />
              {customerTypes[value]}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2>{type === 'business' ? 'Bedrijf en contactpersoon' : 'Persoon'}</h2>
        <p>{type === 'business' ? 'Bedrijfsnaam is verplicht. Een Belgisch btw-nummer wordt gecontroleerd.' : 'Vul minstens een voor- of achternaam in.'}</p>
        <div className={styles.grid}>
          {type === 'business' && <>
            <label className={styles.field + ' ' + styles.span4}>Bedrijfsnaam<input name="company_name" maxLength={160} defaultValue={customer?.company_name} autoComplete="organization" {...invalid('company_name')} />{fieldError('company_name')}</label>
            <label className={styles.field + ' ' + styles.span2}>Btw-nummer<input name="vat_number" maxLength={20} defaultValue={customer?.vat_number ?? ''} placeholder="BE0123456749" {...invalid('vat_number')} />{fieldError('vat_number')}</label>
          </>}
          <label className={styles.field + ' ' + styles.span3}>Voornaam<input name="first_name" maxLength={80} defaultValue={customer?.first_name} autoComplete="given-name" {...invalid('first_name')} />{fieldError('first_name')}</label>
          <label className={styles.field + ' ' + styles.span3}>Achternaam<input name="last_name" maxLength={80} defaultValue={customer?.last_name} autoComplete="family-name" {...invalid('last_name')} />{fieldError('last_name')}</label>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Contact</h2>
        <p>E-mail of telefoon is verplicht. Telefoonnummers worden internationaal opgeslagen (+32…).</p>
        <div className={styles.grid}>
          <label className={styles.field + ' ' + styles.span3}>E-mail<input type="email" name="email" maxLength={254} defaultValue={customer?.email ?? ''} autoComplete="email" {...invalid('email')} />{fieldError('email')}</label>
          <label className={styles.field + ' ' + styles.span3}>Telefoon<input type="tel" name="phone" maxLength={25} defaultValue={customer?.phone ?? ''} autoComplete="tel" placeholder="0470 12 34 56" {...invalid('phone')} />{fieldError('phone')}</label>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Adres</h2>
        <p>Optioneel voor particulieren; nodig voor facturen aan bedrijven.</p>
        <div className={styles.grid}>
          <label className={styles.field + ' ' + styles.span4}>Straat<input name="street" maxLength={160} defaultValue={customer?.street} autoComplete="address-line1" {...invalid('street')} />{fieldError('street')}</label>
          <label className={styles.field + ' ' + styles.span2}>Huisnummer<input name="house_number" maxLength={20} defaultValue={customer?.house_number} {...invalid('house_number')} />{fieldError('house_number')}</label>
          <label className={styles.field + ' ' + styles.span2}>Postcode<input name="postal_code" maxLength={12} defaultValue={customer?.postal_code} autoComplete="postal-code" {...invalid('postal_code')} />{fieldError('postal_code')}</label>
          <label className={styles.field + ' ' + styles.span2}>Gemeente<input name="city" maxLength={80} defaultValue={customer?.city} autoComplete="address-level2" {...invalid('city')} />{fieldError('city')}</label>
          <label className={styles.field + ' ' + styles.span2}>Land<select name="country" defaultValue={customer?.country ?? 'BE'} {...invalid('country')}>{Object.entries(customerCountries).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>{fieldError('country')}</label>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Winkel en voorkeuren</h2>
        <p>Marketingtoestemming wordt alleen geregistreerd als de klant er uitdrukkelijk mee instemt.</p>
        <div className={styles.grid}>
          <label className={styles.field + ' ' + styles.span3}>Voorkeurwinkel<select name="preferred_shop_id" defaultValue={customer?.preferred_shop_id ?? ''} {...invalid('preferred_shop_id')}><option value="">Geen voorkeur</option>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>{fieldError('preferred_shop_id')}</label>
          <label className={styles.check + ' ' + styles.span3} style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" name="marketing_opt_in" defaultChecked={customer?.marketing_opt_in} /> Klant wil nieuwsbrieven en aanbiedingen ontvangen</label>
          <label className={styles.field + ' ' + styles.span6}>Interne notitie<small>Niet zichtbaar voor de klant. Geen gevoelige gegevens zoals rijksregisternummer of bankgegevens.</small><textarea name="note" rows={3} maxLength={4000} defaultValue={customer?.note} {...invalid('note')} />{fieldError('note')}</label>
        </div>
      </div>

      {failure?.duplicates?.length ? (
        <div className={styles.duplicates} role="alert" id="customer-form-error">
          <strong>{failure.error}</strong>
          <ul>{failure.duplicates.map(d => <li key={d.id}><Link href={'/admin/customers/' + d.id}>{d.name || 'Naamloos'}</Link> · {d.customer_number}{d.email ? ' · ' + d.email : ''}{d.phone ? ' · ' + d.phone : ''}</li>)}</ul>
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => submit(true)}>Toch opslaan als aparte klant</button>
        </div>
      ) : failure && !failure.field ? (
        <div className={styles.error} role="alert" id="customer-form-error" style={{ margin: '0 22px 16px' }}>{failure.error}</div>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending}>{pending ? 'Opslaan…' : customer ? 'Wijzigingen opslaan' : 'Klant aanmaken'}</button>
        <Link className={styles.secondary} href={customer ? '/admin/customers/' + customer.id : '/admin/customers'}>Annuleren</Link>
        {saved && <span role="status" className={styles.inlineStatus}>Wijzigingen opgeslagen.</span>}
        {failure?.field && <span role="alert" className={styles.inlineError}>Controleer de gemarkeerde velden.</span>}
      </div>
    </form>
  );
}
