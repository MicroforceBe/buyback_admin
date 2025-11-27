//app/settings/page.tsx

import ShopsSettingsClient from './shops/ShopsSettingsClient';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { hasPermission } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const current = await getCurrentAdminUser();
  const canEdit = current ? hasPermission(current, 'settings', 'write') : false;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Shops</h2>
        <p className="text-sm text-gray-600">
          Beheer de winkels waar klanten hun toestel kunnen binnenbrengen.
        </p>
        <ShopsSettingsClient canEdit={canEdit} />
      </section>

      {/* Later kun je hier meer settings-secties toevoegen */}
    </div>
  );
}
