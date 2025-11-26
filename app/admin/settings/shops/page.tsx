// app/admin/settings/shops/page.tsx
import ShopsSettingsClient from '@/app/settings/shops/ShopsSettingsClient';
import { redirect } from 'next/navigation';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { hasPermission } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const adminUser = await getCurrentAdminUser();

  // Niet ingelogd → eerst naar login
  if (!adminUser) {
    redirect('/admin/login');
  }

  const canRead = hasPermission(adminUser, 'settings', 'read');
  const canWrite = hasPermission(adminUser, 'settings', 'write');

  // Helemaal geen leesrechten → blokkeren
  if (!canRead) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold mb-2">Shops</h1>
        {!canWrite && (
          <span className="text-xs text-gray-500">
            Je hebt alleen leesrechten; wijzigen is uitgeschakeld.
          </span>
        )}
      </div>

      {/* canEdit bepaalt in de client of inputs / opslaan actief zijn */}
      <ShopsSettingsClient canEdit={canWrite} />
    </div>
  );
}
