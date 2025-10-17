import { supabaseServer } from '@/lib/supabaseServer';
import MultipliersTable from './table';

export const metadata = { title: 'Multipliers — Buyback Admin' };

export default async function Page({ searchParams }: { searchParams: { model?: string } }) {
  const supabase = supabaseServer();

  // Haal lijst van modellen op waar multipliers voor bestaan
  const { data: modelsData, error: modelsError } = await supabase
    .from('buyback_multipliers_norm')
    .select('model')
    .neq('model', '')
    .order('model');

  if (modelsError) {
    return <main className="p-6"><pre className="text-red-600">Fout: {modelsError.message}</pre></main>;
  }
  const models = Array.from(new Set((modelsData ?? []).map(m => m.model))).sort();
  const selected = searchParams.model || models[0] || '';

  // Haal multipliers voor geselecteerd model
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

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Model:</span>
        <select
          className="border px-2 py-1 rounded"
          value={selected}
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) url.searchParams.set('model', e.target.value);
            else url.searchParams.delete('model');
            // client nav zonder extra dependency:
            window.location.href = url.toString();
          }}
        >
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {selected ? (
        <MultipliersTable rows={rows as any[]} model={selected} />
      ) : (
        <p className="text-gray-600">Geen modellen met multipliers gevonden.</p>
      )}
    </main>
  );
}
