// app/admin/multipliers/page.tsx
import AdminMultipliersClient from './AdminMultipliersClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  // Client component haalt data op via API; server hier mag licht blijven.
  return (
    <div className="p-5 space-y-4">
      <h1 className="text-2xl font-semibold">Multipliers beheer</h1>
      <p className="text-sm text-gray-600">
        Beheer per-categorie multiplier-sets. Zet per-model een custom set op of gebruik de categorie-set.
      </p>
      <AdminMultipliersClient />
    </div>
  );
}
