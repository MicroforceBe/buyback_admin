import { supabaseServer } from '@/lib/supabaseServer'; import MultipliersTable from './table'; import ModelPicker from './ModelPicker'; import { Card, CardHeader, CardBody } from '@/components/ui/Card';

export const metadata = { title: 'Multipliers — Buyback Admin' };

export default async function Page({ searchParams }: { searchParams: { model?: string } }) {
  const supabase = supabaseServer();

  const { data: modelsData, error: modelsError } = await supabase
    .from('buyback_multipliers_norm')
    .select('model')
    .neq('model', '')
    .order('model');

  if (modelsError) return <pre className="text-red-600">{modelsError.message}</pre>;

  const models = Array.from(new Set((modelsData ?? []).map((m: any) => m.model))).sort();
  const selected = searchParams.model || models[0] || '';

  let rows: any[] = [];
  if (selected) {
    const { data, error } = await supabase
      .from('buyback_multipliers_norm')
      .select('*')
      .eq('model', selected)
      .order('question_key')
      .order('priority')
      .order('option_key');
    if (error) return <pre className="text-red-600">{error.message}</pre>;
    rows = data ?? [];
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Multipliers"
          actions={<ModelPicker models={models} selected={selected} />}
        />
        <CardBody>
          {selected
            ? <MultipliersTable rows={rows as any[]} model={selected} />
            : <p className="text-gray-600">Geen model geselecteerd.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
