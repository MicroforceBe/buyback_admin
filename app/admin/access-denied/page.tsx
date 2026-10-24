import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';

export const dynamic = 'force-dynamic';

export default async function AccessDeniedPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect('/admin/login');
  return (
    <div className="p-4 space-y-3" role="alert">
      <h1 className="text-lg font-semibold">Geen toegang tot deze pagina</h1>
      <p>Je account heeft geen leesrechten voor dit onderdeel. Kies een onderdeel waarvoor je wel toegang hebt via het menu.</p>
      <Link href="/admin/login">Naar aanmelden</Link>
    </div>
  );
}
