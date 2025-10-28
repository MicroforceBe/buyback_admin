import ShopsSettingsClient from '@/app/settings/shops/ShopsSettingsClient';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Shops</h1>
      <ShopsSettingsClient />
    </div>
  );
}
