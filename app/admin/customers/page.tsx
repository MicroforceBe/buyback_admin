import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { hasPermission } from '@/lib/adminPermissions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { customerDisplayName, customerSearchFilters, customerSearchTerm, customerTypes, formatPhone, type CustomerType } from '@/lib/customers';
import LocalDate from '@/app/admin/LocalDate';
import styles from './customers.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LIMIT = 200;

type Row = {
  id: string; customer_number: string; customer_type: CustomerType; first_name: string; last_name: string; company_name: string;
  email: string | null; phone: string | null; city: string; archived_at: string | null; updated_at: string;
};

export default async function CustomersPage({ searchParams }: { searchParams?: Promise<{ q?: string; archived?: string }> }) {
  const user = await requirePageAccess('customers');
  const canWrite = hasPermission(user, 'customers', 'write');
  const params = await searchParams;
  const term = customerSearchTerm(params?.q);
  const showArchived = params?.archived === '1';

  let query = supabaseAdmin
    .from('shop_customers')
    .select('id,customer_number,customer_type,first_name,last_name,company_name,email,phone,city,archived_at,updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(LIMIT);
  if (!showArchived) query = query.is('archived_at', null);
  if (term) for (const filter of customerSearchFilters(term)) query = query.or(filter);
  const { data, error, count } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <div className={styles.workspace}>
      <header className={styles.hero}>
        <div>
          <span>Microforce / winkelbeheer</span>
          <h1>Klanten</h1>
          <p>Eén klantenbestand voor verkoop, reparaties en buybacks.</p>
        </div>
        {canWrite && <Link className={styles.primary} href="/admin/customers/new">+ Nieuwe klant</Link>}
      </header>

      <section className={styles.panel}>
        <form className={styles.toolbar} role="search">
          <div className={styles.search}>
            <input type="search" name="q" defaultValue={params?.q ?? ''} maxLength={80} aria-label="Klanten zoeken" placeholder="Zoek op naam, bedrijf, e-mail, telefoon, gemeente, btw- of klantnummer…" autoFocus />
            <button className={styles.secondary}>Zoeken</button>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /> Ook gearchiveerde klanten
          </label>
        </form>

        {error ? (
          <div role="alert" className={styles.error} style={{ margin: 20 }}>De klanten konden niet worden geladen. Probeer opnieuw; er is niets gewijzigd.</div>
        ) : rows.length ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Klant</th><th className={styles.hideMobile}>Nummer</th><th>Contact</th><th className={styles.hideMobile}>Gemeente</th><th className={styles.hideMobile}>Bijgewerkt</th></tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td>
                        <Link href={'/admin/customers/' + row.id}>{customerDisplayName(row) || 'Naamloos'}</Link>{' '}
                        <span className={styles.badge} data-type={row.customer_type}>{customerTypes[row.customer_type]}</span>
                        {row.archived_at && <> <span className={styles.badge} data-state="archived">Gearchiveerd</span></>}
                      </td>
                      <td className={styles.hideMobile}><span className={styles.number}>{row.customer_number}</span></td>
                      <td><div>{row.email}</div><div className={styles.muted}>{formatPhone(row.phone)}</div></td>
                      <td className={styles.hideMobile}>{row.city}</td>
                      <td className={styles.hideMobile + ' ' + styles.muted}><LocalDate value={new Date(row.updated_at)} timeZone="Europe/Brussels" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.count} style={{ padding: '12px 20px', margin: 0 }}>
              {(count ?? rows.length) > rows.length ? `De ${rows.length} meest recent gewijzigde van ${count} klanten. Verfijn je zoekopdracht om meer te vinden.` : `${rows.length} klant${rows.length === 1 ? '' : 'en'}`}
            </p>
          </>
        ) : (
          <div className={styles.empty}>
            <h3>{term ? 'Geen klanten gevonden' : 'Nog geen klanten'}</h3>
            <p>{term ? 'Controleer de spelling of zoek op e-mail of telefoonnummer.' : canWrite ? 'Maak de eerste klant aan via Nieuwe klant.' : 'Er zijn nog geen klanten geregistreerd.'}</p>
          </div>
        )}
      </section>
    </div>
  );
}
