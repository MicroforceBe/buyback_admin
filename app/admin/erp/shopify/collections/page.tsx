// Collection report: category and model pages without SEO texts or text, internal pages visible to Google.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { shopifyConfig } from '@/lib/shopify/client';
import { COLLECTION_ISSUE_LABELS, type CollectionFix, type CollectionIssue, type CollectionIssueCode } from '@/lib/shopify/collections';
import { applyCollectionFixesAction, generateCollectionReportAction, revertCollectionFixAction } from './actions';
import { SelectAll, SelectionCount } from '../catalog/Selection';
import PendingButton from '@/components/ui/PendingButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/admin/erp/shopify/collections';
const FIX_LABEL: Record<CollectionFix['kind'], string> = { col_seo: 'SEO invullen', col_hide: 'Verbergen', col_heading: 'Koppen', col_clean: 'Opschonen' };
const fixText = (f: CollectionFix) => {
  switch (f.kind) {
    case 'col_seo': return [f.title && `SEO-titel: ${f.title}`, f.description && `Meta: ${f.description}`].filter(Boolean).join(' · ');
    case 'col_hide': return 'Verbergen voor zoekmachines (blijft gewoon werken op de site)';
    case 'col_heading': return `${f.count} H1-kop${f.count === 1 ? '' : 'pen'} in de tekst → H2`;
    case 'col_clean': return `Opschonen: ${[f.scripts ? `${f.scripts} verborgen code-blok${f.scripts === 1 ? '' : 'ken'} weg` : '', f.names ? `${f.names}× [Bedrijfsnaam] → Microforce` : '', f.images ? `${f.images} lege afbeelding${f.images === 1 ? '' : 'en'} weg` : ''].filter(Boolean).join(' · ')}`;
  }
};
const LOG_LABEL: Record<string, string> = { col_seo: 'SEO invullen', col_hide: 'Verbergen', col_heading: 'Koppen', col_clean: 'Opschonen', revert: 'Teruggedraaid' };
const fmt = (iso: string) => new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' });

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const store = (() => { try { return shopifyConfig()?.domain.replace(/\.myshopify\.com$/, '') ?? null; } catch { return null; } })();
  const adminUrl = (gid: string) => (store ? `https://admin.shopify.com/store/${store}/collections/${gid.split('/').pop()}` : null);

  const { data: reports } = await supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,created_by,checked').eq('scope', 'collections').order('created_at', { ascending: false }).limit(10);
  const reportId = params.report ?? reports?.[0]?.id;
  const { data: report } = reportId ? await supabaseAdmin.from('shopify_catalog_reports').select('id,created_at,created_by,checked,counts,issues').eq('id', reportId).eq('scope', 'collections').maybeSingle() : { data: null };
  const counts = (report?.counts ?? {}) as Record<CollectionIssueCode, number>;
  const all = (report?.issues ?? []) as CollectionIssue[];
  const issue = params.issue && Object.hasOwn(COLLECTION_ISSUE_LABELS, params.issue) ? (params.issue as CollectionIssueCode) : null;
  const q = (params.q ?? '').trim().toLowerCase();
  const rows = all.filter(i => (!issue || i.issues.includes(issue)) && (!params.fixable || i.fixes.length) && (!q || i.title.toLowerCase().includes(q) || i.handle.includes(q)));
  const { data: fixLog } = await supabaseAdmin.from('shopify_catalog_fixes').select('id,created_at,title,kind,result,detail,actor').like('product_id', 'gid://shopify/Collection/%').order('created_at', { ascending: false }).limit(50);
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
        <div className="flex justify-between text-xs"><Link href="/admin/erp/shopify" className="text-slate-400 hover:text-white">← Shopify-sync</Link><Link href="/admin/erp/shopify/catalog" className="text-sky-300 hover:text-white">Catalogusrapport →</Link></div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Collectierapport</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Categorie- en modelpagina&apos;s zonder SEO-titel, meta-description of tekst, extra H1-koppen, lege of dubbele collecties en interne collecties die Google kan tonen. Pagina&apos;s met producten op voorraad staan bovenaan.</p>
        {isAdmin && <form action={generateCollectionReportAction} className="mt-4"><PendingButton dark pendingText="Rapport wordt gemaakt…" hint="Duurt ongeveer een minuut." className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-900">Nieuw rapport maken</PendingButton><span className="ml-3 text-xs text-slate-400">Duurt ongeveer een minuut.</span></form>}
      </div>

      {params.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</div>}
      {params.notice && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{params.notice}</div>}
      {params.applied && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Aangepast: {params.applied} · overgeslagen: {params.skipped} · mislukt: {params.failed}. Maak een nieuw rapport om het resultaat te zien.</div>}
      {Number(params.nomatch) > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{params.nomatch} geselecteerde collecties hadden geen voorstel van het aangevinkte soort en zijn niet aangepast.</div>}

      {!report ? <p className="text-sm text-slate-600">Nog geen rapport. {isAdmin ? 'Klik op "Nieuw rapport maken".' : ''}</p> : (
        <>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <h2 className="text-lg font-semibold">Rapport van {fmt(report.created_at)} · {report.checked} collecties nagekeken · {all.length} met minstens één probleem</h2>
              <span className="text-xs text-slate-500">door {report.created_by}</span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
              {(Object.keys(COLLECTION_ISSUE_LABELS) as CollectionIssueCode[]).map(code => (
                <Link key={code} href={link({ issue: issue === code ? undefined : code })} className={`rounded-xl border p-3 hover:border-sky-400 ${issue === code ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : ''}`}>
                  <dt className="text-xs text-slate-500">{COLLECTION_ISSUE_LABELS[code]}</dt><dd className="text-lg font-bold">{counts[code] ?? 0}</dd>
                </Link>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <form className="flex gap-2">
                <input type="hidden" name="report" value={report.id} />
                {issue && <input type="hidden" name="issue" value={issue} />}
                <input name="q" defaultValue={params.q ?? ''} placeholder="Zoek titel of handle" className="rounded-lg border px-3 py-1.5" />
                <button className="rounded-lg border px-3 py-1.5 font-semibold hover:bg-slate-50">Zoeken</button>
              </form>
              <Link href={link({ fixable: params.fixable ? undefined : '1' })} className="text-sky-700 hover:underline">{params.fixable ? 'Alle tonen' : 'Alleen automatisch te herstellen'}</Link>
              <span className="text-slate-500">{rows.length} collecties</span>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <form key={`${report.id}|${issue ?? ''}|${q}|${params.fixable ?? ''}`} action={applyCollectionFixesAction}>
              <input type="hidden" name="report" value={report.id} />
              {issue && <input type="hidden" name="issue" value={issue} />}
              {isAdmin && (
                <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-4 space-y-2 rounded-t-2xl border-b bg-slate-50/95 p-4 text-sm shadow-sm backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">Geselecteerde collecties aanpassen in Shopify (max. 200)</p>
                    <SelectionCount max={200} />
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="kind" value="col_seo" /> <b>SEO invullen</b> <span className="text-xs text-slate-500">(lege velden)</span></label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="kind" value="col_hide" /> <b>Verbergen</b> <span className="text-xs text-slate-500">(interne collecties, voor zoekmachines)</span></label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="kind" value="col_heading" /> <b>Koppen</b> <span className="text-xs text-slate-500">(H1 → H2)</span></label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="kind" value="col_clean" /> <b>Opschonen</b> <span className="text-xs text-slate-500">(verborgen code en lege afbeeldingen weg, [Bedrijfsnaam] → Microforce)</span></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" required /> Ik bevestig deze aanpassing</label>
                    <PendingButton pendingText="Wordt aangepast…" hint="Collecties worden één voor één in Shopify aangepast." className="rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white">Aanpassen</PendingButton>
                    <span className="text-xs text-slate-500">Elke collectie wordt eerst opnieuw gelezen; bestaande SEO-teksten worden nooit overschreven. Elke aanpassing kan in het logboek teruggedraaid worden.</span>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr>{isAdmin && <th className="py-2 pr-2"><SelectAll /></th>}<th className="pr-4">Collectie</th><th className="pr-4 text-right">Actief</th><th className="pr-4 text-right">Op voorraad</th><th className="pr-4">Problemen</th><th>Voorgestelde aanpassing</th></tr></thead>
                  <tbody className="divide-y">
                    {rows.map(r => {
                      const url = adminUrl(r.collectionId);
                      return (
                        <tr key={r.collectionId} className="align-top">
                          {isAdmin && <td className="py-2 pr-2">{r.fixes.length > 0 && <input type="checkbox" name="ids" value={r.collectionId} aria-label={`Selecteer ${r.title}`} />}</td>}
                          <td className="py-2 pr-4">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{r.title}</a> : r.title}<div className="font-mono text-xs text-slate-400">/collections/{r.handle}</div>{r.duplicateOf && <div className="text-xs text-amber-800">zelfde producten als &quot;{r.duplicateOf}&quot;</div>}</td>
                          <td className="pr-4 text-right tabular-nums">{r.active}</td>
                          <td className={`pr-4 text-right tabular-nums ${r.inStock > 0 ? 'font-semibold text-green-700' : 'text-slate-400'}`}>{r.inStock}</td>
                          <td className="pr-4"><div className="flex flex-wrap gap-1">{r.issues.map(c => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{COLLECTION_ISSUE_LABELS[c] ?? c}</span>)}</div></td>
                          <td className="text-xs text-slate-600">{r.fixes.map((f, i) => <div key={i}><span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{FIX_LABEL[f.kind]}</span>{fixText(f)}</div>)}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={6} className="py-3 text-slate-500">Geen collecties voor deze filter.</td></tr>}
                  </tbody>
                </table>
              </div>
            </form>
          </section>

          {isAdmin && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="font-semibold">Logboek aanpassingen (laatste 50)</h3>
              <table className="mt-2 min-w-full text-left text-sm">
                <tbody className="divide-y">
                  {(fixLog ?? []).map(l => (
                    <tr key={l.id}><td className="py-1.5 pr-4">{fmt(l.created_at)}</td><td className="pr-4">{l.title}</td><td className="pr-4">{LOG_LABEL[l.kind] ?? l.kind}</td><td className={`pr-4 ${l.result === 'ok' ? 'text-green-700' : l.result === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{{ ok: 'gelukt', skipped: 'overgeslagen', failed: 'mislukt' }[l.result as string] ?? l.result}</td><td className="text-slate-600">{l.detail} · {l.actor}</td>
                      <td className="pl-3">{l.kind !== 'revert' && l.result === 'ok' && (reverted.has(l.id) ? <span className="text-xs text-slate-400">teruggedraaid</span> : (
                        <form action={revertCollectionFixAction}><input type="hidden" name="report" value={report.id} /><input type="hidden" name="fix" value={l.id} /><button className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50">Terugdraaien</button></form>
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
