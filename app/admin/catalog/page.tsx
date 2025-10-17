import { supabaseServer } from '@/lib/supabaseServer';
import CatalogTable from './table';

export const metadata = { title: 'Catalogus — Buyback Admin' };

export default async function Page() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('buyback_catalog_api')
    .select('*')
    .order('brand')
    .order('model')
    .order('variant')
    .order('capacity_gb');

  if (error) {
    return <pre className="p-6 text-red-600">Fout: {error.message}</pre>;
  }

  return (
    <main className="p-6">
      <h2 className="text-lg font-semibold mb-3">Catalogus — Inline edit</h2>
      <CatalogTable rows={data ?? []} />
    </main>
  );
}
