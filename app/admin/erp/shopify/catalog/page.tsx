// Catalogue report: products with weak photos, missing categories, missing or wrong properties.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { shopifyConfig } from '@/lib/shopify/client';
import { ISSUE_GROUPS, ISSUE_LABELS, type CatalogIssue, type Fix, type IssueCode } from '@/lib/shopify/catalog';
import { applyFixesAction, generateReportAction, revertFixAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/admin/erp/shopify/catalog';
const PAGE_SIZE = 200;
const fixText = (f: Fix) => {
  switch (f.kind) {
    case 'condition': return `Uiterlijk → ${f.value}`;
    case 'category': return `Tags ${f.tags.join(', ')} (zoals ${f.fromSku})${f.removeEmptyTag ? ', lege "cat_" weg' : ''}`;
    case 'seo': return [f.title && `SEO-titel: ${f.title}`, f.description && `Meta: ${f.description}`].filter(Boolean).join(' · ');
    case 'seo_replace': return `SEO vervangen — titel: "${f.oldTitle}" → "${f.title}" · meta: "${f.oldDescription}" → "${f.description}"`;
    case 'description': return `Beschrijving overnemen van "${f.fromTitle}"`;
  }
};
const fmt = (iso: string) => new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' });

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const store = (() => { try { return shopifyConfig()?.domain.replace(/\.myshopify\.com$/, '') ?? null; } catch { return null; } })();
  const productUrl = (gid: string) => (store ? `https://admin.shopify.com/store/${store}/products/${gid.split('/').pop()}` : null);

  const { data: reports } = await supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,created_by,checked').order('created_at', { ascending: false }).limit(10);
  const reportId = params.report ?? reports?.[0]?.id;
  const { data: report } = reportId ? await supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,created_by,checked,counts,issues').eq('id', reportId).maybeSingle() : { data: null };
  const counts = (report?.counts ?? {}) as Record<IssueCode, number>;
  const all = (report?.issues ?? []) as CatalogIssue[];
  const issue = params.issue && Object.hasOwn(ISSUE_LABELS, params.issue) ? (params.issue as IssueCode) : null;
  const q = (params.q ?? '').trim().toLowerCase();
  const filtered = all.filter(i => (!issue || i.issues.includes(issue)) && (!params.fixable || i.fixes.length) && (!q || i.title.toLowerCase().includes(q) || i.skus.some(s => s.includes(q))));
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { data: fixLog } = await supabaseAdmin.from('shopify_catalog_fixes').select('id,created_at,title,kind,result,detail,actor,reverts').order('created_at', { ascending: false }).limit(50);
  const logIds = (fixLog ?? []).map(l => l.id);
  const { data: revertRows } = logIds.length ? await supabaseAdmin.from('shopify_catalog_fixes').select('reverts').in('reverts', logIds).eq('result', 'ok') : { data: [] };
  const reverted = new Set((revertRows ?? []).map(r => r.reverts));
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ report: reportId, issue: issue ?? undefined, q: params.q, fixable: params.fixable, ...extra })) if (v) p.set(k, v);
    return `${PATH}?${p}`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white shadow-sm">
        <Link href="/admin/erp/shopify" className="text-xs text-slate-400 hover:text-white">← Shopify-sync</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Catalogusrapport</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Actieve producten en concepten met zwakke foto&apos;s, ontbrekende categorie of collectie, ontbrekende of verkeerde eigenschappen en tags die niet kloppen. Producten met voorraad staan bovenaan. Veilige aanpassingen (Uiterlijk volgens de sterren, categorie zoals een gelijkend product) kan een beheerder hier uitvoeren.</p>
        {isAdmin && <form action={generateReportAction} className="mt-4"><button className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-900">Nieuw rapport maken</button><span className="ml-3 text-xs text-slate-400">Duurt 1 à 2 minuten.</span></form>}
      </div>

      {params.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</div>}
      {params.notice && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{params.notice}</div>}
      {params.applied && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Aangepast: {params.applied} · overgeslagen: {params.skipped} · mislukt: {params.failed}. Maak een nieuw rapport om het resultaat te zien.</div>}

      {!report ? <p className="text-sm text-slate-600">Nog geen rapport. {isAdmin ? 'Klik op "Nieuw rapport maken".' : ''}</p> : (
        <>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <h2 className="text-lg font-semibold">Rapport van {fmt(report.created_at)} · {report.checked} producten nagekeken · {all.length} met minstens één probleem</h2>
              <span className="text-xs text-slate-500">door {report.created_by}{reports && reports.length > 1 ? ' · eerdere: ' : ''}{(reports ?? []).slice(1, 5).map(r => <Link key={r.id} href={`${PATH}?report=${r.id}`} className="ml-2 text-sky-700 hover:underline">{fmt(r.created_at)}</Link>)}</span>
            </div>
            {ISSUE_GROUPS.map(g => (
              <div key={g.label} className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
                <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  {g.codes.map(code => (
                    <Link key={code} href={link({ issue: issue === code ? undefined : code, page: undefined })} className={`rounded-xl border p-3 hover:border-sky-400 ${issue === code ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : ''}`}>
                      <dt className="text-xs text-slate-500">{ISSUE_LABELS[code]}</dt><dd className="text-lg font-bold">{counts[code] ?? 0}</dd>
                    </Link>
                  ))}
                </dl>
              </div>
            ))}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <form className="flex gap-2">
                <input type="hidden" name="report" value={report.id} />
                {issue && <input type="hidden" name="issue" value={issue} />}
                <input name="q" defaultValue={params.q ?? ''} placeholder="Zoek titel of SKU" className="rounded-lg border px-3 py-1.5" />
                <button className="rounded-lg border px-3 py-1.5 font-semibold hover:bg-slate-50">Zoeken</button>
              </form>
              <Link href={link({ fixable: params.fixable ? undefined : '1', page: undefined })} className="text-sky-700 hover:underline">{params.fixable ? 'Alle tonen' : 'Alleen automatisch te herstellen'}</Link>
              <span className="text-slate-500">{filtered.length} producten</span>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <form action={applyFixesAction}>
              <input type="hidden" name="report" value={report.id} />
              {issue && <input type="hidden" name="issue" value={issue} />}
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr>{isAdmin && <th className="py-2 pr-2"></th>}<th className="pr-4">Product</th><th className="pr-4">SKU</th><th className="pr-4 text-right">Voorraad</th><th className="pr-4">Problemen</th><th>Voorgestelde aanpassing</th></tr></thead>
                  <tbody className="divide-y">
                    {rows.map(r => {
                      const url = productUrl(r.productId);
                      return (
                        <tr key={r.productId} className="align-top">
                          {isAdmin && <td className="py-2 pr-2">{r.fixes.length > 0 && <input type="checkbox" name="ids" value={r.productId} aria-label={`Selecteer ${r.title}`} />}</td>}
                          <td className="py-2 pr-4">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{r.title}</a> : r.title}<span className="ml-2 text-xs text-slate-400">{r.status === 'DRAFT' ? 'concept' : 'actief'}</span></td>
                          <td className="pr-4 font-mono text-xs">{r.skus.join(', ')}</td>
                          <td className={`pr-4 text-right tabular-nums ${r.stock > 0 ? 'font-semibold text-green-700' : 'text-slate-400'}`}>{r.stock}</td>
                          <td className="pr-4"><div className="flex flex-wrap gap-1">{r.issues.map(c => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{ISSUE_LABELS[c] ?? c}</span>)}</div></td>
                          <td className="text-xs text-slate-600">{r.fixes.map((f, i) => <div key={i}>{fixText(f)}</div>)}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={6} className="py-3 text-slate-500">Geen producten voor deze filter.</td></tr>}
                  </tbody>
                </table>
              </div>
              {filtered.length > PAGE_SIZE && (
                <div className="mt-3 flex gap-3 text-sm">
                  {page > 1 && <Link href={link({ page: String(page - 1) })} className="text-sky-700 hover:underline">← Vorige</Link>}
                  <span className="text-slate-500">Pagina {page} van {Math.ceil(filtered.length / PAGE_SIZE)}</span>
                  {page * PAGE_SIZE < filtered.length && <Link href={link({ page: String(page + 1) })} className="text-sky-700 hover:underline">Volgende →</Link>}
                </div>
              )}
              {isAdmin && (
                <div className="mt-4 space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
                  <p className="font-semibold">Geselecteerde producten aanpassen in Shopify (max. 200)</p>
                  <p className="text-xs text-slate-600">Elk product wordt eerst opnieuw gelezen. Er wordt alleen iets gewijzigd als de titel sinds het rapport niet veranderd is en het probleem nog bestaat. Foto&apos;s, alt-teksten, kleur, bestaande SEO-teksten, bestaande beschrijvingen en tags zoals main_sku worden nooit automatisch aangepast.</p>
                  <label className="flex items-center gap-2"><input type="checkbox" name="kind" value="condition" defaultChecked /> Uiterlijk invullen of rechtzetten volgens de sterren in de titel</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="kind" value="category" /> Categorie-tags toevoegen zoals bij het meest gelijkende product</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="kind" value="seo" /> Ontbrekende SEO-titel en meta-description invullen met de voorgestelde tekst</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="kind" value="seo_replace" /> Slechte SEO-tekst vervangen door het voorstel (oude tekst wordt bewaard en kan teruggezet worden)</label>
                  <p className="text-xs text-slate-600">Producten met een SEO-tekst van deze tool krijgen de tag <code>tinyimg_metadata_skip</code>, zodat TinySEO ze niet meer overschrijft. Terugdraaien haalt die tag weer weg.</p>
                  <label className="flex items-center gap-2"><input type="checkbox" name="kind" value="description" /> Lege beschrijving overnemen van een product van hetzelfde model</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> Ik bevestig deze aanpassing</label>
                  <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Aanpassen</button>
                </div>
              )}
            </form>
          </section>

          {isAdmin && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="font-semibold">Logboek aanpassingen (laatste 50)</h3>
              <table className="mt-2 min-w-full text-left text-sm">
                <tbody className="divide-y">
                  {(fixLog ?? []).map(l => (
                    <tr key={l.id}><td className="py-1.5 pr-4">{fmt(l.created_at)}</td><td className="pr-4">{l.title}</td><td className="pr-4">{({ condition: 'Uiterlijk', category: 'Categorie', seo: 'SEO invullen', seo_replace: 'SEO vervangen', description: 'Beschrijving', revert: 'Teruggedraaid' } as Record<string, string>)[l.kind] ?? l.kind}</td><td className={`pr-4 ${l.result === 'ok' ? 'text-green-700' : l.result === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{{ ok: 'gelukt', skipped: 'overgeslagen', failed: 'mislukt' }[l.result as string] ?? l.result}</td><td className="text-slate-600">{l.detail} · {l.actor}</td>
                      <td className="pl-3">{(l.kind === 'seo' || l.kind === 'seo_replace') && l.result === 'ok' && (reverted.has(l.id) ? <span className="text-xs text-slate-400">teruggedraaid</span> : (
                        <form action={revertFixAction}><input type="hidden" name="report" value={report.id} /><input type="hidden" name="fix" value={l.id} /><button className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50">Terugdraaien</button></form>
                      ))}</td></tr>
                  ))}
                  {!fixLog?.length && <tr><td className="py-2 text-slate-500">Nog geen aanpassingen.</td></tr>}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
