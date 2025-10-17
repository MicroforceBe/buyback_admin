'use server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// We gebruiken service key, dus alleen vanuit server actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FileSchema = z.object({
  type: z.enum(['prices', 'multipliers']),
  csv: z.string().min(5)
});

// CSV → rows (split)
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line =>
    line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim())
  );
  return { header, rows };
}

export async function importCsv(input: z.input<typeof FileSchema>) {
  const { type, csv } = FileSchema.parse(input);
  const parsed = parseCsv(csv);
  const target = type === 'prices' ? 'buyback_prices_landing' : 'buyback_multipliers_landing';

  // clear + insert
  const { error: delErr } = await supabaseAdmin.from(target).delete().neq('model', '');
  if (delErr) throw new Error(`Verwijderen mislukt: ${delErr.message}`);

  const chunkSize = 500;
  for (let i = 0; i < parsed.rows.length; i += chunkSize) {
    const chunk = parsed.rows.slice(i, i + chunkSize).map(r => {
      const obj: any = {};
      parsed.header.forEach((h, idx) => (obj[h] = r[idx]));
      return obj;
    });
    const { error } = await supabaseAdmin.from(target).insert(chunk);
    if (error) throw new Error(`Insert fout: ${error.message}`);
  }

  // call function
  const fn = type === 'prices' ? 'import_buyback_prices' : 'import_buyback_multipliers';
  const { error: fnErr } = await supabaseAdmin.rpc(fn);
  if (fnErr) throw new Error(`Function ${fn} mislukt: ${fnErr.message}`);

  return { ok: true, count: parsed.rows.length };
}
