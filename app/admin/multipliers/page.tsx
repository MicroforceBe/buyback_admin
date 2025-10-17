import { supabaseServer } from '@/lib/supabaseServer';
import MultipliersTable from './table';
import ModelPicker from './ModelPicker';

export const metadata = { title: 'Multipliers — Buyback Admin' };

export default async function Page({ searchParams }: { searchParams: { model?: string } }) {
  const supabase = supabaseServer();

  // modellen ophalen
  const { data: modelsData, error: modelsError } = await supabase
    .from('buyback_multipliers_norm')
    .select('model')
    .neq('model', '')
    .order('model');

  if (modelsError) {
    return <main className="p-6"><pre className="text-red-600">Fout: {modelsError.message}</pre></main>;
  }

  const models = Array.from(new Set((modelsData ?? []).map((m: any) => m.model))).sort();
  const selected = searchParams.model || models[0] || '';

  // rijen voor geselecteerd model ophalen
  let rows: any[] = [];
  if (selected) {
    const { data, error } = await supabase
      .from('buyback_multipliers_norm')
      .select('*')
      .eq('model', selected)
      .order('question_key')
      .order('priority')
      .order('option_key');

    if (error) {
      return <main className="p-6"><pre className="text-red-600">Fout: {error.message}</pre></main>;
    }
    rows = data ?? [];
  }

  return (
    <main className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Multipliers</h2>
      {models.length > 0 ? (
        <>
          <ModelPicker models={models} selected={selected} />
          {selected ? (
            <MultipliersTable rows={rows as any[]} model={selected} />
          ) : (
            <p className="text-gray-600">Geen model geselecteerd.</p>
          )}
        </>
      ) : (
        <p className="text-gray-600">Geen modellen met multipliers gevonden.</p>
      )}
    </main>
  );
}
