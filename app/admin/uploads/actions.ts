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

/** Detecteer delimiter op basis van headerlijn */
function detectDelimiter(line: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = {
    ',': (line.match(/,/g) || []).length,
    ';': (line.match(/;/g) || []).length,
    '\t': (line.match(/\t/g) || []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as ','|';'|'\t';
  return (best || ';'); // onze CSV’s zijn meestal ;
}

/** Splitst één regel rekening houdend met quotes en gekozen delimiter */
function splitCsvLine(line: string, delimiter: string): string[] {
  const d = delimiter.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
  const re = new RegExp(`${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'g');
  return line
    .split(re)
    .map((c) => c.replace(/^\s*"|"$/g, '').replace(/""/g, '"').trim());
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV bevat geen data (minstens 2 regels verwacht).');

  const delimiter = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((ln) => splitCsvLine(ln, delimiter));
  return { header, rows };
}

/** Normaliseer kolomnamen: lowercase, verwijder niet-alfanumeriek, map varianten → canonical */
function normalizeKey(k: string): string {
  const s = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  // snelle alias-mapping voor prices
  if (['storage', 'capacity', 'capacity_gb', 'geheugen', 'opsalg', 'opslag', 'gb'].includes(t)) return 'storage_gb';
  if (['price', 'base_price', 'buyback_price', 'prijs', 'amount'].includes(t)) return 'base_price';
  if (['jaar', 'bouwjaar', 'release_year'].includes(t)) return 'year';
  if (['ram', 'ram_gb', 'memory_gb'].includes(t)) return 'ram_gb';
  if (['ssd', 'ssd_gb', 'storage_ssd'].includes(t)) return 'ssd_gb';
  if (['image', 'image_url', 'img', 'foto', 'afbeelding'].includes(t)) return 'image_url';
  return t;
}

/** Filter object naar alleen toegestane kolommen per landing-tabel */
function filterToAllowed(obj: Record<string, any>, allowed: string[]) {
  const out: Record<string, any> = {};
  for (const k of allowed) if (k in obj) out[k] = obj[k];
  return out;
}

export async function importCsv(input: z.input<typeof FileSchema>) {
  const { type, csv } = FileSchema.parse(input);
  const parsed = parseCsv(csv);

  // header normaliseren
  const normHeader = parsed.header.map(normalizeKey);

  // whitelists per landing-tabel
  const allowedPrices = [
    'brand', 'category', 'model', 'submodel', 'variant',
    'year', 'storage_gb', 'connectivity', 'cpu',
    'ram_gb', 'ssd_gb', 'base_price', 'image_url'
  ];
  const allowedMultipliers = [
    'model',
    // multiplier kolommen (waarden)
    'functional_ja','functional_neen','functional_klein',
    'screen_geen','screen_klein','screen_groot',
    'housing_minimaal','housing_sporen','housing_zwaar',
    'battery_100','battery_gt85','battery_le85','battery_unknown',
    'eu_yes','eu_no','icloud_yes','icloud_no',
    // labels + tips
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
    // vragen-titels
    'q_functional_title','q_screen_title','q_housing_title','q_battery_title','q_eu_title','q_icloud_title',
    // ui tips in multipliers sheet
    'ship_opzenden_tip','ship_binnenbrengen_tip',
    'store_gentbrugge_tip','store_antwerpen_tip','store_oudenaarde_tip',
    'pay_bank_tip','pay_voucher_tip'
  ];

  const target = type === 'prices' ? 'buyback_prices_landing' : 'buyback_multipliers_landing';
  const allowed = type === 'prices' ? allowedPrices : allowedMultipliers;

  // Bouw JSON records uit rows
  const records = parsed.rows.map((row) => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < normHeader.length; i++) {
      const key = normHeader[i];
      obj[key] = row[i] ?? null;
    }
    return filterToAllowed(obj, allowed);
  });

  // Basale sanity checks
  if (type === 'prices') {
    const must = ['brand', 'model', 'storage_gb', 'base_price'];
    const missing = must.filter((m) => !normHeader.includes(m));
    if (missing.length) {
      throw new Error(`CSV mist verplichte kolommen voor prijzen: ${missing.join(', ')}. Gevonden headers: ${normHeader.join(', ')}`);
    }
  } else {
    const must = ['model'];
    const missing = must.filter((m) => !normHeader.includes(m));
    if (missing.length) {
      throw new Error(`CSV mist verplichte kolom 'model' voor multipliers. Gevonden headers: ${normHeader.join(', ')}`);
    }
  }

  // 1) landing tabel leegmaken (service role kan full delete)
  {
    const { error: delErr } = await supabaseAdmin.from(target).delete().gte('model', '');
    // .gte('model','') = veilige no-op filter die alle niet-null modellen pakt, voorkomt policy errors
    if (delErr) throw new Error(`Opschonen van ${target} mislukt: ${delErr.message}`);
  }

  // 2) batch inserts
  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from(target).insert(chunk);
    if (error) {
      // toon een voorbeeld van de eerste rij van de batch om debugging te helpen
      throw new Error(`Insert in ${target} mislukt: ${error.message}. Voorbeeld record: ${JSON.stringify(chunk[0]).slice(0, 300)}...`);
    }
  }

  // 3) RPC draaien
  const fn = type === 'prices' ? 'import_buyback_prices' : 'import_buyback_multipliers';
  const { error: fnErr } = await supabaseAdmin.rpc(fn);
  if (fnErr) throw new Error(`Function ${fn} mislukt: ${fnErr.message}`);

  return { ok: true, count: records.length };
}
