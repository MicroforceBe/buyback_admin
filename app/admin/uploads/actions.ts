'use server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FileSchema = z.object({
  type: z.enum(['prices', 'multipliers']),
  csv: z.string().min(5)
});

type ImportResult = { ok: true; count: number } | { ok: false; error: string; details?: any };

function detectDelimiter(line: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = {
    ',': (line.match(/,/g) || []).length,
    ';': (line.match(/;/g) || []).length,
    '\t': (line.match(/\t/g) || []).length
  };
  const best = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] as ','|';'|'\t';
  return best || ';';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const d = delimiter.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
  const re = new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'g');
  return line
    .split(re)
    .map((c) => c.replace(/^\s*"|"$/g, '').replace(/""/g, '"').trim());
}

function parseCsv(text: string): { header: string[]; rows: string[][]; delimiter: string } {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV bevat geen data (minstens 2 regels verwacht).');
  const delimiter = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((ln) => splitCsvLine(ln, delimiter));
  return { header, rows, delimiter };
}

function normalizeKey(k: string): string {
  const s = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['storage', 'capacity', 'capacity_gb', 'geheugen', 'opsalg', 'opslag', 'gb'].includes(t)) return 'storage_gb';
  if (['price', 'base_price', 'buyback_price', 'prijs', 'amount'].includes(t)) return 'base_price';
  if (['jaar', 'bouwjaar', 'release_year'].includes(t)) return 'year';
  if (['ram', 'ram_gb', 'memory_gb'].includes(t)) return 'ram_gb';
  if (['ssd', 'ssd_gb', 'storage_ssd'].includes(t)) return 'ssd_gb';
  if (['image', 'image_url', 'img', 'foto', 'afbeelding'].includes(t)) return 'image_url';
  return t;
}

function filterToAllowed(obj: Record<string, any>, allowed: string[]) {
  const out: Record<string, any> = {};
  for (const k of allowed) if (k in obj) out[k] = obj[k];
  return out;
}

// === NIEUW: normalisatie naar DB-typen ===
const NUMERIC_INT_KEYS = new Set(['year','storage_gb','ram_gb','ssd_gb']);

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[^0-9\-]/g, '');
  if (cleaned === '' || cleaned === '-' ) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function sanitizeForLanding(record: Record<string, any>, isPrices: boolean) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    // lege string -> null
    const val = (v === '') ? null : v;

    if (isPrices && NUMERIC_INT_KEYS.has(k)) {
      out[k] = toIntOrNull(val);
    } else {
      out[k] = val;
    }
  }
  return out;
}

export async function importCsv(input: z.input<typeof FileSchema>): Promise<ImportResult> {
  try {
    const { type, csv } = FileSchema.parse(input);

    // 1) CSV inlezen
    const parsed = parseCsv(csv);
    const normHeader = parsed.header.map(normalizeKey);

    const allowedPrices = [
      'brand','category','model','submodel','variant',
      'year','storage_gb','connectivity','cpu','ram_gb','ssd_gb','base_price','image_url'
    ];
    const allowedMultipliers = [
      'model',
      'functional_ja','functional_neen','functional_klein',
      'screen_geen','screen_klein','screen_groot',
      'housing_minimaal','housing_sporen','housing_zwaar',
      'battery_100','battery_gt85','battery_le85','battery_unknown',
      'eu_yes','eu_no','icloud_yes','icloud_no',
      'functional_opt_ja_label','functional_opt_ja_tip',
      'functional_opt_neen_label','functional_opt_neen_tip',
      'functional_opt_klein_label','functional_opt_klein_tip',
      'screen_opt_geen_label','screen_opt_geen_tip',
      'screen_opt_klein_label','screen_opt_klein_tip',
      'screen_opt_groot_label','screen_opt_groot_tip',
      'housing_opt_minimaal_label','housing_opt_minimaal_tip',
      'housing_opt_sporen_label','housing_opt_sporen_tip',
      'housing_opt_zwaar_label','housing_opt_zwaar_tip',
      'battery_opt_100_label','battery_opt_100_tip',
      'battery_opt_gt85_label','battery_opt_gt85_tip',
      'battery_opt_le85_label','battery_opt_le85_tip',
      'battery_opt_unknown_label','battery_opt_unknown_tip',
      'eu_opt_yes_label','eu_opt_yes_tip',
      'eu_opt_no_label','eu_opt_no_tip',
      'icloud_opt_yes_label','icloud_opt_yes_tip',
      'icloud_opt_no_label','icloud_opt_no_tip',
      'q_functional_title','q_screen_title','q_housing_title','q_battery_title','q_eu_title','q_icloud_title',
      'ship_opzenden_tip','ship_binnenbrengen_tip',
      'store_gentbrugge_tip','store_antwerpen_tip','store_oudenaarde_tip',
      'pay_bank_tip','pay_voucher_tip'
    ];

    const isPrices = type === 'prices';
    const target = isPrices ? 'buyback_prices_landing' : 'buyback_multipliers_landing';
    const allowed = isPrices ? allowedPrices : allowedMultipliers;

    // verplichte kolommen
    if (isPrices) {
      const must = ['brand','model','storage_gb','base_price'];
      const missing = must.filter(m => !normHeader.includes(m));
      if (missing.length) {
        return { ok: false, error: `CSV mist verplichte kolommen: ${missing.join(', ')}`, details: { header: parsed.header, detectedDelimiter: parsed.delimiter } };
      }
    } else {
      if (!normHeader.includes('model')) {
        return { ok: false, error: `CSV mist verplichte kolom 'model'`, details: { header: parsed.header, detectedDelimiter: parsed.delimiter } };
      }
    }

    // 2) Records bouwen + sanitiseren
    const rawRecords = parsed.rows.map((row) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < normHeader.length; i++) obj[normHeader[i]] = row[i] ?? null;
      return filterToAllowed(obj, allowed);
    });
    const records = rawRecords.map(r => sanitizeForLanding(r, isPrices));

    // 3) Landing tabel leegmaken
    {
      const { error: delErr } = await supabaseAdmin.from(target).delete().gte('model', '');
      if (delErr) return { ok: false, error: `Opschonen van ${target} mislukt: ${delErr.message}` };
    }

    // 4) Insert in batches
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from(target).insert(chunk);
      if (error) {
        return { ok: false, error: `Insert in ${target} mislukt: ${error.message}`, details: { example: chunk[0] } };
      }
    }

    // 5) RPC draaien
    const fn = isPrices ? 'import_buyback_prices' : 'import_buyback_multipliers';
    const { error: fnErr } = await supabaseAdmin.rpc(fn);
    if (fnErr) return { ok: false, error: `Function ${fn} mislukt: ${fnErr.message}` };

    return { ok: true, count: records.length };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Onbekende fout' };
  }
}
