// Marketing overview: findability (SEO health from the catalogue and collection reports), what to fix
// first, and the marketing sources that are (not yet) connected.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ISSUE_LABELS, type CatalogIssue, type IssueCode } from '@/lib/shopify/catalog';
import { COLLECTION_ISSUE_LABELS, type CollectionIssueCode } from '@/lib/shopify/collections';
import GoogleSection from './GoogleSection';
import FeedSection from './FeedSection';
import { loadGoogle } from './googleLoad';
import { merchantIssueLabel, shopifyProductIdOf } from '@/lib/marketing/googleData';
import { shopifyConfig } from '@/lib/shopify/client';
import { COLLECTION_METRICS, metrics, PRODUCT_METRICS, seoScore, sourceStatus, topActions, type Metric, type StoredReport } from '@/lib/marketing/overview';

export const dynamic = 'force-dynamic';

const CATALOG = '/admin/erp/shopify/catalog';
const COLLECTIONS = '/admin/erp/shopify/collections';
const fmt = (iso: string) => new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short', timeStyle: 'short' });
const FIX_LABEL: Record<string, string> = {
  seo: 'SEO invullen', seo_replace: 'SEO vervangen', description: 'Beschrijving', heading: 'Koppen', clean: 'Opschonen',
  alt_photo: "Alt foto's", alt_photo_replace: 'Alt vervangen', alt_text: 'Alt beschrijving', condition: 'Uiterlijk', category: 'Categorie',
  col_seo: 'Collectie-SEO', col_hide: 'Collectie verborgen', col_heading: 'Collectiekoppen', col_clean: 'Collectie opgeschoond', revert: 'Teruggedraaid',
};

/** Small bar trend of the stored reports, old → new. */
function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 6, gap = 2, h = 22;
  return (
    <svg width={values.length * (w + gap)} height={h} aria-hidden="true" className="text-sky-500">
      {values.map((v, i) => <rect key={i} x={i * (w + gap)} y={h - Math.max(1, (v / max) * h)} width={w} height={Math.max(1, (v / max) * h)} rx={1} fill="currentColor" opacity={i === values.length - 1 ? 1 : 0.35} />)}
    </svg>
  );
}

function MetricTile({ m, href }: { m: Metric; href: string }) {
  // Fewer findings is better: a drop is green, a rise red.
  const tone = m.delta === null || m.delta === 0 ? 'text-slate-400' : m.delta < 0 ? 'text-green-700' : 'text-red-700';
  return (
    <Link href={href} className="block rounded-2xl border bg-white p-4 shadow-sm hover:border-sky-400">
      <div className="text-xs text-slate-500">{m.label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div><span className="text-2xl font-bold text-slate-900">{m.now}</span>
          {m.delta !== null && <span className={`ml-2 text-xs font-semibold ${tone}`}>{m.delta > 0 ? `+${m.delta}` : m.delta === 0 ? '±0' : m.delta}</span>}</div>
        <Trend values={m.trend} />
      </div>
    </Link>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const [{ data: productReports }, { data: collectionReports }] = await Promise.all([
    supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,checked,counts').eq('scope', 'products').order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,checked,counts').eq('scope', 'collections').order('created_at', { ascending: false }).limit(10),
  ]);
  const products = (productReports ?? []) as StoredReport<IssueCode>[];
  const collections = (collectionReports ?? []) as StoredReport<CollectionIssueCode>[];
  const { data: latest } = products[0] ? await supabaseAdmin.from('shopify_catalog_reports').select('checked,issues').eq('id', products[0].id).maybeSingle() : { data: null };
  const issues = (latest?.issues ?? []) as CatalogIssue[];
  const score = seoScore(latest ? { checked: Number(latest.checked ?? 0), issues } : null);
  const actions = topActions(issues);
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  // All applied fixes of the last 7 days, page by page (Supabase returns at most 1000 rows per request).
  const week = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('shopify_catalog_fixes').select('kind').eq('result', 'ok').gte('created_at', since).order('id', { ascending: true }).range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) week.set(r.kind, (week.get(r.kind) ?? 0) + 1);
    if (!data || data.length < 1000) break;
  }
  const sources = sourceStatus(process.env);
  const google = await loadGoogle();
  const merchant = google && !('settingsError' in google) && google.mc?.ok ? google.mc.data : null;
  const store = (() => { try { return shopifyConfig()?.domain.replace(/\.myshopify\.com$/, '') ?? null; } catch { return null; } })();
  // Shopify Google channel offers carry the product id; other feeds (Channable) are found by searching their offer id.
  const shopifyLink = (offerId: string) => {
    if (!store) return null;
    const id = shopifyProductIdOf(offerId);
    return id ? `https://admin.shopify.com/store/${store}/products/${id}` : `https://admin.shopify.com/store/${store}/products?query=${encodeURIComponent(offerId)}`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Alle marketing op één plek: vindbaarheid in Google, verkeer, advertenties, e-mail en reputatie. Vandaag uit onze eigen catalogus- en collectierapporten; de andere bronnen verschijnen hier zodra ze gekoppeld zijn.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div><div className="text-xs uppercase tracking-wide text-slate-400">SEO-score producten</div><div className="mt-1 text-4xl font-bold">{score ? `${score.score}%` : '—'}</div><div className="text-xs text-slate-400">producten zonder vindbaarheidsprobleem</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Op voorraad met probleem</div><div className="mt-1 text-4xl font-bold">{score ? score.inStockWithIssues : '—'}</div><div className="text-xs text-slate-400">wat klanten nu zien</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Aanpassingen (7 dagen)</div><div className="mt-1 text-4xl font-bold">{[...week.entries()].filter(([k]) => k !== 'revert').reduce((a, [, n]) => a + n, 0)}</div><div className="text-xs text-slate-400">uitgevoerd via de rapporten</div></div>
        </div>
      </div>

      {params.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</div>}
      {params.ok && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{params.ok}</div>}

      <GoogleSection isAdmin={isAdmin} />

      <FeedSection isAdmin={isAdmin} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Eerst aanpakken</h2><span className="text-xs text-slate-500">producten op voorraad, uit het rapport van {products[0] ? fmt(products[0].created_at) : '—'}</span></div>
        {actions.length ? (
          <div className="divide-y rounded-2xl border bg-white shadow-sm">
            {actions.map(a => (
              <Link key={a.code} href={`${CATALOG}?issue=${a.code}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
                <span><b>{a.inStock}</b> {a.inStock === 1 ? 'product' : 'producten'}: {a.label}</span>
                <span className="text-xs text-slate-500">{a.fixable ? `${a.fixable} met voorstel →` : 'manueel →'}</span>
              </Link>
            ))}
          </div>
        ) : <p className="rounded-2xl border bg-white p-4 text-sm text-slate-500">{products.length ? 'Geen vindbaarheidsproblemen bij producten op voorraad.' : <>Nog geen catalogusrapport. <Link href={CATALOG} className="text-sky-700 underline">Maak er een</Link>.</>}</p>}
        {merchant && merchant.disapproved.length > 0 && (
          <details className="rounded-2xl border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 hover:bg-slate-50">
              <span><b>{merchant.byStatus.NOT_ELIGIBLE_OR_DISAPPROVED ?? merchant.disapproved.length}</b> {(merchant.byStatus.NOT_ELIGIBLE_OR_DISAPPROVED ?? merchant.disapproved.length) === 1 ? 'product' : 'producten'} afgekeurd in Google Shopping</span>
              <span className="text-xs text-slate-500">toon de lijst ↓</span>
            </summary>
            <table className="w-full border-t text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Product</th><th className="py-2">Waarom</th><th className="px-4 py-2 text-right">Shopify</th></tr></thead>
              <tbody>{merchant.disapproved.map(p => {
                const href = shopifyLink(p.offerId);
                return (
                  <tr key={p.offerId || p.title} className="border-t align-top">
                    <td className="px-4 py-2">{p.title}<div className="text-xs text-slate-400">{p.offerId}</div></td>
                    <td className="py-2 text-xs text-slate-600">{p.issues.length ? p.issues.map(merchantIssueLabel).join(' · ') : '—'}</td>
                    <td className="px-4 py-2 text-right">{href ? <a href={href} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">openen ↗</a> : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Vindbaarheid producten</h2><Link href={CATALOG} className="text-sm text-sky-700 hover:underline">Catalogusrapport →</Link></div>
        <p className="text-xs text-slate-500">Aantal producten per controle; het verschil is t.o.v. het vorige rapport, de balkjes tonen de laatste {products.length} rapporten.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metrics(products, PRODUCT_METRICS, ISSUE_LABELS).map(m => <MetricTile key={m.code} m={m} href={`${CATALOG}?issue=${m.code}`} />)}</div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Vindbaarheid collecties</h2><Link href={COLLECTIONS} className="text-sm text-sky-700 hover:underline">Collectierapport →</Link></div>
        {collections.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{metrics(collections, COLLECTION_METRICS, COLLECTION_ISSUE_LABELS).map(m => <MetricTile key={m.code} m={m} href={`${COLLECTIONS}?issue=${m.code}`} />)}</div>
          : <p className="rounded-2xl border bg-white p-4 text-sm text-slate-500">Nog geen collectierapport. <Link href={COLLECTIONS} className="text-sky-700 underline">Maak er een</Link>.</p>}
      </section>

      {week.size > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Aanpassingen van de laatste 7 dagen</h2>
          <div className="flex flex-wrap gap-2">{[...week.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="rounded-full border bg-white px-3 py-1 text-sm"><b>{n}</b> {FIX_LABEL[k] ?? k}</span>)}</div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bronnen</h2>
        <p className="text-xs text-slate-500">Elke bron wordt alleen-lezen gekoppeld. De sleutels staan als instelling in Vercel; deze pagina kijkt alleen óf ze ingevuld zijn, nooit naar de waarde.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sources.map(({ source, connected, missing }) => (
            <div key={source.key} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-xs text-slate-500">{source.group}</div><div className="font-semibold">{source.name}</div></div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${connected ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{connected ? 'Instellingen aanwezig' : `Fase ${source.phase}`}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{source.shows}</p>
              {!connected && <p className="mt-2 text-xs text-slate-400">Nodig: {missing.join(', ')}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
