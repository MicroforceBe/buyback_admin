import { supabaseServer } from '@/lib/supabaseServer'; import CatalogTable from './table'; import { Card, CardHeader, CardBody } from '@/components/ui/Card';

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

  if (error) return <pre className="text-red-600">{error.message}</pre>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Catalogus — Inline edit" />
        <CardBody>
          <CatalogTable rows={data ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}
