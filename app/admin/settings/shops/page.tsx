// app/admin/settings/shops/page.tsx
import ShopsSettingsClient from '@/app/settings/shops/ShopsSettingsClient';
import { redirect } from 'next/navigation';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { hasPermission } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  if (!hasPermission(adminUser, 'settings', 'read')) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Shops</h1>
      <ShopsSettingsClient />
    </div>
  );
}
