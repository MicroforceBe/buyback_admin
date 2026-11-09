// Models & GTIN: one GTIN (EAN) per device model, used by the Google feed for every grade of that model.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { gtinsByModel, modelKey } from '@/lib/marketing/merchantFeed';
import { runModelBarcodesAction, saveGtinsAction } from '../actions';

export const dynamic = 'force-dynamic';
type Row = { key: string; titles: Set<string>; skus: number; stock: number };

export default async function GtinPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const models = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('erp_articles').select('sku,title,inventory_qty').eq('refurbished_product', true).eq('missing_from_erp', false).order('sku', { ascending: true }).range(from, from + 999);
    if (error) break;
    for (const a of data ?? []) {
      const key = modelKey(String(a.title ?? ''));
      if (!key) continue;
      const row = models.get(key) ?? { key, titles: new Set<string>(), skus: 0, stock: 0 };
      row.titles.add(String(a.title)); row.skus++; row.stock += Math.max(0, Number(a.inventory_qty ?? 0));
      models.set(key, row);
    }
    if (!data || data.length < 1000) break;
  }
  const gtinRows: { model_key: string; gtin: string; source_url: string | null; updated_by: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('model_gtins').select('model_key,gtin,source_url,updated_by').order('model_key').range(from, from + 999);
    if (error) break;
    gtinRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  // Rows stored under an older spelling of the model key stay visible under the current key.
  const gtins = gtinsByModel(gtinRows);
  const list = [...models.values()].sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || a.key.localeCompare(b.key));
  const inStock = list.filter(r => r.stock > 0);
  const covered = inStock.filter(r => gtins.has(r.key)).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/marketing" className="text-sm text-sky-700 hover:underline">← Marketing</Link>
        <h1 className="mt-1 text-2xl font-semibold">Modellen & GTIN</h1>
        <p className="mt-1 text-sm text-slate-600">Eén GTIN (EAN) per model, voor elke kwaliteitsklasse van dat model. De Google-feed stuurt hem mee als het product zelf geen streepjescode heeft. Gebruik de EAN van de Europese versie (Apple: artikelnummer eindigt op ZD/A). Geen GTIN is beter dan een verkeerde.</p>
        <p className="mt-2 text-sm"><strong>{covered}</strong> van de <strong>{inStock.length}</strong> modellen op voorraad hebben een GTIN · {list.length} refurbished modellen in totaal.</p>
      </div>
      {params.ok && <div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{params.ok}</div>}
      {params.error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{params.error}</div>}
      {isAdmin && (
        <form action={runModelBarcodesAction} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="min-w-0 flex-1 text-sm text-slate-600">
            <h2 className="font-semibold text-slate-900">Barcodes in Shopify</h2>
            Elk uur zet de tool de GTIN van het model in de barcode van refurbished producten <strong>zonder</strong> barcode, zodat hij ook op de productpagina staat (gestructureerde data). Een bestaande barcode wordt nooit overschreven; alleen een code die de tool zelf zette, wordt aangepast als je de GTIN van het model wijzigt.
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Nu invullen</button>
        </form>
      )}
      {isAdmin && (
        <form action={saveGtinsAction} className="space-y-2 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">GTIN's toevoegen of wijzigen</h2>
          <p className="text-xs text-slate-500">Eén per regel: <code>model ; GTIN ; bron-URL</code>. Het model zoals in de tabel hieronder. Een lege GTIN verwijdert de code van dat model.</p>
          <textarea name="lines" rows={6} className="block w-full rounded-xl border px-3 py-2 font-mono text-xs" placeholder="iphone 13 128gb midnight ; 0194252707289 ; https://…" />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Bewaren</button>
        </form>
      )}
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">Model</th><th className="p-3">SKU&apos;s</th><th className="p-3">Voorraad</th><th className="p-3">GTIN</th><th className="p-3">Bron</th></tr></thead>
          <tbody>{list.map(r => {
            const g = gtins.get(r.key);
            return (
              <tr key={r.key} className={`border-t ${r.stock ? '' : 'text-slate-400'}`}>
                <td className="p-3"><div className="font-mono text-xs">{r.key}</div><div className="text-xs text-slate-500">{[...r.titles].slice(0, 2).join(' · ')}</div></td>
                <td className="p-3">{r.skus}</td>
                <td className="p-3">{r.stock}</td>
                <td className="p-3 font-mono text-xs">{g?.gtin ?? <span className="text-slate-400">—</span>}</td>
                <td className="p-3 text-xs">{g?.source_url ? <a href={g.source_url} target="_blank" rel="noreferrer noopener" className="text-sky-700 hover:underline">bron</a> : ''}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
