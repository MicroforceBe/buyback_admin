import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageAccess } from '@/lib/security/access';
import { hasPermission } from '@/lib/adminPermissions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CUSTOMER_COLUMNS, customerDisplayName, customerEventLabels, customerFieldLabels, customerTypes, formatPhone, isUuid, type Customer,
} from '@/lib/customers';
import LocalDate from '@/app/admin/LocalDate';
import CustomerForm from '../CustomerForm';
import { ArchiveButton, LinkLeadButton } from './CustomerControls';
import styles from '../customers.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Lead = { id: string; order_code: string; model: string; status: string; final_price_cents: number; created_at: string };
type Event = { id: number; event: string; actor: string; changed_fields: string[]; created_at: string };

const euro = (cents: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ created?: string }> }) {
  const user = await requirePageAccess('customers');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const canWrite = hasPermission(user, 'customers', 'write');
  const canSeeLeads = hasPermission(user, 'leads', 'read');
  const canLinkLeads = canWrite && hasPermission(user, 'leads', 'write');
  const created = (await searchParams)?.created === '1';

  const { data, error } = await supabaseAdmin.from('shop_customers').select(CUSTOMER_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    return <div className={styles.workspace}><div role="alert" className={styles.error}>De klant kon niet worden geladen. Probeer opnieuw.</div></div>;
  }
  if (!data) notFound();
  const customer = data as unknown as Customer;

  const leadColumns = 'id,order_code,model,status,final_price_cents,created_at';
  const [{ data: shops }, { data: events }, linked, suggested] = await Promise.all([
    supabaseAdmin.from('buyback_shops').select('id,name').order('name'),
    supabaseAdmin.from('shop_customer_events').select('id,event,actor,changed_fields,created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    canSeeLeads
      ? supabaseAdmin.from('buyback_leads').select(leadColumns).eq('shop_customer_id', id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Lead[] }),
    canSeeLeads && customer.email && !customer.archived_at
      ? supabaseAdmin.from('buyback_leads').select(leadColumns).is('shop_customer_id', null).ilike('email', customer.email.replace(/[%_\\]/g, '\\$&')).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as Lead[] }),
  ]);
  const shopName = (shops ?? []).find(s => s.id === customer.preferred_shop_id)?.name;
  const linkedLeads = (linked.data ?? []) as Lead[];
  const suggestedLeads = (suggested.data ?? []) as Lead[];
  const address = [[customer.street, customer.house_number].filter(Boolean).join(' '), [customer.postal_code, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <div className={styles.workspace}>
      <Link className={styles.back} href="/admin/customers">← Alle klanten</Link>
      <header className={styles.hero}>
        <div>
          <span>Klant {customer.customer_number}</span>
          <h1>{customerDisplayName(customer) || 'Naamloos'}</h1>
          <div className={styles.heroMeta}>
            <span>{customerTypes[customer.customer_type]}</span>
            {customer.vat_number && <span>{customer.vat_number}</span>}
            {customer.archived_at && <span>Gearchiveerd</span>}
          </div>
        </div>
        {canWrite && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><ArchiveButton id={customer.id} version={customer.version} archived={Boolean(customer.archived_at)} /></div>}
      </header>

      {created && <p role="status" className={styles.success}>Klant {customer.customer_number} is aangemaakt.</p>}
      {customer.archived_at && <p role="status" className={styles.error}>Deze klant is gearchiveerd. Zet de klant terug om gegevens te wijzigen of leads te koppelen.</p>}

      <div className={styles.layout}>
        <section className={styles.panel}>
          {canWrite && !customer.archived_at ? (
            <CustomerForm customer={customer} shops={shops ?? []} />
          ) : (
            <div className={styles.card}>
              <h3>Gegevens</h3>
              <dl className={styles.facts}>
                <dt>E-mail</dt><dd>{customer.email || '—'}</dd>
                <dt>Telefoon</dt><dd>{formatPhone(customer.phone) || '—'}</dd>
                <dt>Adres</dt><dd>{address || '—'}</dd>
                <dt>Notitie</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{customer.note || '—'}</dd>
              </dl>
            </div>
          )}
        </section>

        <aside className={styles.panel}>
          <div className={styles.card}>
            <h3>Overzicht</h3>
            <dl className={styles.facts}>
              <dt>Klantnummer</dt><dd className={styles.number}>{customer.customer_number}</dd>
              <dt>Telefoon</dt><dd>{formatPhone(customer.phone) || '—'}</dd>
              <dt>Voorkeurwinkel</dt><dd>{shopName || '—'}</dd>
              <dt>Marketing</dt><dd>{customer.marketing_opt_in ? <>Ja, sinds {customer.marketing_opt_in_at ? <LocalDate value={new Date(customer.marketing_opt_in_at)} timeZone="Europe/Brussels" /> : '—'}</> : 'Geen toestemming'}</dd>
              <dt>Aangemaakt</dt><dd><LocalDate value={new Date(customer.created_at)} timeZone="Europe/Brussels" /></dd>
            </dl>
          </div>

          {canSeeLeads && (
            <div className={styles.card}>
              <h3>Buyback-leads</h3>
              {linkedLeads.length ? (
                <ul className={styles.list}>
                  {linkedLeads.map(lead => <li key={lead.id}><span><strong>{lead.order_code}</strong><br /><span className={styles.muted}>{lead.model} · {lead.status}</span></span><span>{euro(lead.final_price_cents)}</span></li>)}
                </ul>
              ) : <p className={styles.muted} style={{ margin: 0 }}>Nog geen leads gekoppeld.</p>}
              {suggestedLeads.length > 0 && (
                <>
                  <h3 style={{ marginTop: 18 }}>Mogelijk van deze klant</h3>
                  <p className={styles.muted} style={{ margin: '0 0 10px' }}>Niet-gekoppelde leads met hetzelfde e-mailadres.</p>
                  <ul className={styles.list}>
                    {suggestedLeads.map(lead => (
                      <li key={lead.id}>
                        <span><strong>{lead.order_code}</strong><br /><span className={styles.muted}>{lead.model} · <LocalDate value={new Date(lead.created_at)} timeZone="Europe/Brussels" /></span></span>
                        {canLinkLeads ? <LinkLeadButton customerId={customer.id} leadId={lead.id} /> : <span>{euro(lead.final_price_cents)}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className={styles.card}>
            <h3>Historiek</h3>
            {(events ?? []).length ? (
              <ol className={styles.timeline}>
                {((events ?? []) as Event[]).map(e => (
                  <li key={e.id}>
                    {customerEventLabels[e.event] ?? e.event}
                    {e.event === 'updated' && e.changed_fields.length > 0 && <>: {Array.from(new Set(e.changed_fields.map(f => customerFieldLabels[f] ?? f))).join(', ')}</>}
                    <small>{e.actor} · <LocalDate value={new Date(e.created_at)} withTime timeZone="Europe/Brussels" /></small>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.muted} style={{ margin: 0 }}>Nog geen historiek.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
