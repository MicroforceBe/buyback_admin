import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageAccess } from '@/lib/security/access';
import { hasPermission } from '@/lib/adminPermissions';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import CustomerForm from '../CustomerForm';
import styles from '../customers.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NewCustomerPage() {
  const user = await requirePageAccess('customers');
  if (!hasPermission(user, 'customers', 'write')) redirect('/admin/access-denied');
  const { data: shops } = await supabaseAdmin.from('buyback_shops').select('id,name').eq('active', true).order('name');
  return (
    <div className={styles.workspace}>
      <Link className={styles.back} href="/admin/customers">← Alle klanten</Link>
      <header className={styles.hero}>
        <div>
          <span>Klanten / nieuw</span>
          <h1>Nieuwe klant</h1>
          <p>We waarschuwen als er al een klant bestaat met hetzelfde e-mailadres, telefoonnummer of btw-nummer.</p>
        </div>
      </header>
      <section className={styles.panel}>
        <CustomerForm shops={shops ?? []} />
      </section>
    </div>
  );
}
