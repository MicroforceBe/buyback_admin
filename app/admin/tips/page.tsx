import { supabaseServer } from '@/lib/supabaseServer';
import TipsTable from './table';
import ModelPicker from './ModelPicker';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';

export const metadata = { title: 'UI Tips — Buyback Admin' };

export default async function Page({ searchParams }: { searchParams: { model?: string } }) {
  const supabase = supabaseServer();

  // Modellen ophalen met tips of vanuit catalogus als fallback
  const { data: tipModels, error: tipsErr } = await supabase
    .from('buyback_ui_tips')
    .select('model')
    .order('model');
  if (tipsErr) return <main className="p-6"><pre className="text-red-600">{tipsErr.message}</pre></main>;

  let models = Array.from(new Set((tipModels ?? []).map((m: any) => m.model))).sort();

  // Fallback: als er nog geen tips zijn, toon modellen uit de catalogus
  if (models.length === 0) {
    const { data: catModels, error: catErr } = await supabase
      .from('buyback_catalog')
      .select('model')
      .order('model')
      .limit(2000);
    if (catErr) return <main className="p-6"><pre className="text-red-600">{catErr.message}</pre></main>;
    models = Array.from(new Set((catModels ?? []).map((m: any) => m.model))).sort();
  }

  const selected = searchParams.model || models[0] || '';

  // Tips voor geselecteerd model
  let rows: any[] = [];
  if (selected) {
    const { data, error } = await supabase
      .from('buyback_ui_tips')
      .select('*')
      .eq('model', selected);
    if (error) return <main className="p-6"><pre className="text-red-600">{error.message}</pre></main>;
    rows = data ?? [];
  }

  return (
    <main className="p-6 space-y-6">
      <Card>
        <CardHeader title="UI Tips" actions={<ModelPicker models={models} selected={selected} />} />
        <CardBody>
          {selected
            ? <TipsTable rows={rows as any[]} model={selected} />
            : <p className="text-gray-600">Geen model geselecteerd.</p>}
        </CardBody>
      </Card>
    </main>
  );
}
