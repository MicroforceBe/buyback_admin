// Shopify sync (replaces Matrixify): status, mode, safety brake, recent runs and their changes.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { shopifyConfig } from '@/lib/shopify/client';
import { MODES, PATH, back, type Mode } from './modes';
import { redirectBacklogAction, releaseMissingAction, removalAction, runNowAction, saveSettingsAction, stopAction } from './actions';
import { DELETE_AFTER_DAYS, MAX_PER_ACTION } from '@/lib/shopify/removal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;


const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' }) : '—');
const LISTS = {
  erpOnly: { label: 'Alleen in ERP', key: 'erpOnlySkus', help: 'Staan in het ERP-bestand maar niet in Shopify. Ze worden alleen als concept aangemaakt als dat in de instellingen aan staat.' },
  shopifyOnly: { label: 'Alleen in Shopify', key: 'shopifyOnlySkus', help: 'Staan in Shopify (actief of concept) maar niet in het ERP-bestand. De synchronisatie raakt ze niet aan; je kunt ze hier archiveren.' },
  shopifyArchived: { label: 'Alleen in Shopify, gearchiveerd', key: 'shopifyOnlyArchivedSkus', help: 'Gearchiveerde Shopify-producten die niet in het ERP-bestand staan. Ze zijn niet zichtbaar in de webshop; je kunt ze hier terugzetten als concept.' },
  duplicate: { label: 'Dubbele SKU in Shopify', key: 'duplicateSkuList', help: 'Deze SKU staat op meer dan één variant in Shopify en wordt daarom overgeslagen.' },
  dupTitles: { label: 'Dubbele titels in ERP', key: 'duplicateTitleList', help: 'ERP-artikelen met exact dezelfde titel. Ze worden gewoon per SKU gesynchroniseerd; kijk na of het om echt verschillende artikelen gaat of om een dubbele aanmaak in het ERP. Nieuwe concepten met zo’n titel krijgen de tag controle-dubbele-titel.' },
} as const;
type ListKey = keyof typeof LISTS;
const STATUS: Record<string, string> = { running: 'bezig', succeeded: 'geslaagd', failed: 'mislukt', stopped: 'noodrem' };
const STATUS_CLASS: Record<string, string> = { running: 'bg-sky-100 text-sky-800', succeeded: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800', stopped: 'bg-amber-100 text-amber-800' };

export default async function ShopifySyncPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const configured = (() => { try { return shopifyConfig() !== null; } catch { return false; } })();

  const [{ data: settings }, { data: runs }] = await Promise.all([
    supabaseAdmin.from('shopify_sync_settings').select('mode,max_changes,create_drafts,handle_missing,version,updated_at,updated_by').eq('id', true).single(),
    (() => {
      let q = supabaseAdmin.from('shopify_sync_runs').select('id,trigger,mode,status,started_at,started_by,changes:counts->>changes')
        .order('started_at', { ascending: false }).limit(params.runs === 'all' ? 100 : 10);
      // "Only with changes or problems": anything that is not a succeeded run with 0 changes.
      if (params.only === 'changes') q = q.or('status.neq.succeeded,counts->>changes.neq.0');
      return q;
    })(),
  ]);
  const selectedId = params.run ?? runs?.[0]?.id;
  const { data: selected } = selectedId
    ? await supabaseAdmin.from('shopify_sync_runs').select('id,mode,status,started_at,counts,error').eq('id', selectedId).maybeSingle()
    : { data: null };
  const onlyErrors = params.errors === '1';
  let changesQuery = supabaseAdmin.from('shopify_sync_changes').select('id,sku,scope,field,old_value,new_value,applied,error').eq('run_id', selectedId ?? '00000000-0000-0000-0000-000000000000').order('id').limit(300);
  if (onlyErrors) changesQuery = changesQuery.not('error', 'is', null);
  const { data: changes } = selected ? await changesQuery : { data: [] };
  const mode = (settings?.mode ?? 'off') as Mode;
  // Products archived via this tool (latest successful action per product is 'archive'), and the log.
  // The complete history of successful actions (paginated), independent of the short log below.
  const latestOk = new Map<string, { product_id: string; title: string; skus: string[]; action: string; created_at: string }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from('shopify_product_removals').select('product_id,title,skus,action,created_at')
      .eq('result', 'ok').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
    for (const r of data ?? []) if (!latestOk.has(r.product_id)) latestOk.set(r.product_id, r);
    if (!data || data.length < 1000) break;
  }
  const { data: removalRows } = await supabaseAdmin.from('shopify_product_removals').select('id,product_id,title,skus,action,result,detail,redirect,actor,created_at').order('created_at', { ascending: false }).limit(30);
  const archivedList = [...latestOk.values()].filter(r => r.action === 'archive');
  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const c = (selected?.counts ?? {}) as Record<string, unknown>;
  const view = params.view && Object.hasOwn(LISTS, params.view) ? (params.view as ListKey) : null;
  const q = (params.q ?? '').trim().toLowerCase();
  const allUnmatched = view && Array.isArray(c[LISTS[view].key]) ? (c[LISTS[view].key] as { sku: string; title: string; productId?: string; inventory?: Record<string, number>; priceCents?: number | null; status?: string | null }[]) : [];
  const unmatched = q ? allUnmatched.filter(u => u.sku.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)) : allUnmatched;
  // One column per store (location), shortened: "Microforce Gentbrugge" -> "Gentbrugge".
  const stores = [...new Set(allUnmatched.flatMap(u => Object.keys(u.inventory ?? {})))].sort();
  const storeLabel = (name: string) => name.replace(/^Microforce\s+/i, '');
  const total = (u: { inventory?: Record<string, number> }) => Object.values(u.inventory ?? {}).reduce((a, b) => a + b, 0);
  const store = (() => { try { return shopifyConfig()?.domain.replace(/\.myshopify\.com$/, '') ?? null; } catch { return null; } })();
  const productUrl = (gid?: string) => (store && gid ? `https://admin.shopify.com/store/${store}/products/${gid.split('/').pop()}` : null);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white shadow-sm">
        <div className="flex justify-between text-xs"><Link href="/admin/erp" className="text-slate-400 hover:text-white">← ERP</Link><Link href="/admin/erp/shopify/catalog" className="text-sky-300 hover:text-white">Catalogusrapport →</Link></div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Shopify-synchronisatie</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Vervangt Matrixify. Elke 15 minuten (5 minuten na de ERP-import) vergelijken we de ERP-CSV met Shopify en schrijven we alleen wat verschilt: titel, merk, type, status, prijs, vergelijkingsprijs, btw, voorraad per winkel en vijf metavelden. Verdwenen artikelen worden nooit verwijderd; nieuwe artikelen worden alleen als concept aangemaakt als dat aan staat.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${mode === 'live' ? 'bg-green-500 text-white' : mode === 'shadow' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-200'}`}>Modus: {MODES[mode]}</span>
          <span className={`rounded-full px-3 py-1 ${configured ? 'bg-white/10' : 'bg-red-500/80'}`}>{configured ? 'Shopify gekoppeld' : 'Shopify niet gekoppeld'}</span>
          {mode !== 'off' && <form action={stopAction}><button className="rounded-full bg-red-600 px-4 py-1 font-semibold text-white hover:bg-red-700">Noodstop: zet uit</button></form>}
        </div>
      </div>

      {params.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</div>}
      {params.removed && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        {{ archive: 'Gearchiveerd', restore: 'Teruggezet als concept', delete: 'Definitief verwijderd' }[params.removed] ?? 'Uitgevoerd'}: {params.ok} · overgeslagen: {params.refused} · mislukt: {params.failed}
        {(params.removed === 'delete' || params.removed === 'archive') && (params.scope === '1' ? ` · doorverwijzingen: ${params.redirects}` : ' · geen doorverwijzingen (recht write_online_store_navigation ontbreekt nog)')}. Details staan in het logboek onderaan.
      </div>}
      {params.backlog && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Doorverwijzingen aangemaakt: {params.created} · had er al een: {params.existing} · mislukt: {params.failed}{params.remaining === '1' ? '. Er zijn er nog meer: klik nog eens.' : '.'}
      </div>}
      {params.saved && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{params.saved === 'stop' ? 'De synchronisatie staat uit.' : params.saved === 'released' ? 'De vastgehouden artikelen zijn vrijgegeven.' : 'Instellingen opgeslagen.'}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Instellingen</h2>
          {isAdmin ? (
            <form action={saveSettingsAction} className="mt-4 space-y-4 text-sm">
              <input type="hidden" name="version" value={settings?.version ?? 1} />
              <label className="block">Modus
                <select name="mode" defaultValue={mode} className="mt-1 block w-full rounded-lg border px-3 py-2">
                  {Object.entries(MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">Noodrem: maximaal aantal wijzigingen per run
                <input name="max_changes" type="number" min={1} max={100000} defaultValue={settings?.max_changes ?? 1500} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                <span className="mt-1 block text-xs text-slate-500">Zijn er meer wijzigingen, dan schrijft de run niets en stopt hij. Zo kan een kapotte CSV de webshop niet leegmaken.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="create_drafts" defaultChecked={settings?.create_drafts === true} className="mt-1" />
                <span>Nieuwe ERP-artikelen als <b>concept</b> (draft) aanmaken in Shopify
                  <span className="mt-1 block text-xs text-slate-500">Maximaal 50 per run, met de tag <code>erp-nieuw</code>. Zolang die tag op het product staat, verandert de synchronisatie de status niet; verwijder de tag als foto’s en beschrijving klaar zijn. Bij meer dan 200 nieuwe artikelen tegelijk wordt niets aangemaakt (vermoedelijk een fout in het ERP-bestand).</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="handle_missing" defaultChecked={settings?.handle_missing === true} className="mt-1" />
                <span>Artikelen die niet meer in het ERP staan: <b>voorraad meteen op 0</b> en na 24 uur <b>archiveren</b>
                  <span className="mt-1 block text-xs text-slate-500">Geldt voor actieve producten en concepten in Shopify waarvan de SKU niet in de recente ERP-exports staat. Een product met meerdere varianten wordt pas gearchiveerd als geen enkele variant nog in het ERP staat. Producten met de tag <code>erp-negeren</code> blijven ongemoeid. Verdwijnen er meer dan 100 artikelen binnen het uur, dan gebeurt er niets (vermoedelijk een fout in de export). Gearchiveerde producten kun je na 30 dagen definitief verwijderen.</span>
                </span>
              </label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Opslaan</button>
            </form>
          ) : <p className="mt-4 text-sm text-slate-600">Alleen beheerders wijzigen de modus. Noodrem: {settings?.max_changes} wijzigingen. Nieuwe artikelen als concept: {settings?.create_drafts ? 'aan' : 'uit'}.</p>}
          <p className="mt-4 text-xs text-slate-500">Laatst gewijzigd {fmt(settings?.updated_at ?? null)} door {settings?.updated_by}.</p>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recente runs</h2>
            {isAdmin && mode !== 'off' && <form action={runNowAction}><button className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Nu uitvoeren</button></form>}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link href={back({ ...(params.runs ? { runs: params.runs } : {}), ...(params.only === 'changes' ? {} : { only: 'changes' }) })} className="text-sky-700 hover:underline">{params.only === 'changes' ? 'Alle runs tonen' : 'Alleen met wijzigingen of fouten'}</Link>
            <span className="text-slate-400">Runs zonder wijzigingen worden na 24 uur gewist, andere na 30 dagen.</span>
          </div>
          <ul className="mt-2 divide-y text-sm">
            {(runs ?? []).map(r => {
              const n = r.changes === null || r.changes === undefined ? null : Number(r.changes);
              return (
                <li key={r.id} className={`flex items-center justify-between gap-3 py-1.5 ${r.id === selectedId ? 'font-semibold' : ''}`}>
                  <Link href={back({ run: r.id, ...(params.only ? { only: params.only } : {}), ...(params.runs ? { runs: params.runs } : {}) })} className="truncate hover:underline">
                    {fmt(r.started_at)} · {r.trigger === 'cron' ? 'auto' : 'handmatig'} · {r.mode === 'live' ? 'live' : 'schaduw'}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {n !== null && <span className={`text-xs tabular-nums ${n > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{n} wijz.</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status] ?? ''}`}>{STATUS[r.status] ?? r.status}</span>
                  </span>
                </li>
              );
            })}
            {!runs?.length && <li className="py-2 text-slate-500">{params.only === 'changes' ? 'Geen runs met wijzigingen of fouten.' : 'Nog geen runs.'}</li>}
          </ul>
          {params.runs !== 'all' && (runs?.length ?? 0) >= 10 && <Link href={back({ runs: 'all', ...(params.only ? { only: params.only } : {}) })} className="mt-2 inline-block text-xs text-sky-700 hover:underline">Meer tonen</Link>}
        </section>
      </div>

      {selected && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Run van {fmt(selected.started_at)}</h2>
          {selected.error && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{selected.error}</p>}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {([['ERP-regels', c.erpRows], ['Gekoppeld', c.matched], ['Ongewijzigd', c.unchanged], ['Wijzigingen', c.changes, null], ['Alleen in ERP', c.erpOnly, 'erpOnly'], ['Alleen in Shopify', c.shopifyOnly, 'shopifyOnly'], ['Alleen in Shopify, gearchiveerd', c.shopifyOnlyArchived, 'shopifyArchived'], ['Dubbele SKU in Shopify', c.duplicateSkus, 'duplicate'], ['Dubbele titels in ERP', c.duplicateTitles, 'dupTitles'], ['Niet op locatie', c.notStocked], ['Productconflicten', c.productConflicts], ['Ongeldige rijen', c.invalidRows], ['Mislukte SKU’s', c.failedSkus], ['Nieuwe concepten', c.newDrafts], ['Concepten met dubbele titel', c.newDuplicateTitles], ['Concepten zonder categorie', c.newWithoutCategory], ['Status vergrendeld (erp-nieuw)', c.statusLocked], ['Niet meer in ERP: voorraad → 0', c.missingStockZeroed], ['Niet meer in ERP: op concept gezet', c.missingDeactivated], ['Niet meer in ERP: gearchiveerd', c.missingArchived], ['Niet meer in ERP: doorverwezen', c.missingRedirects], ['Niet meer in ERP: vastgehouden', c.missingHeld], ['Uit ERP-export (oud in database)', c.notInExport], ['Actief, niet in webshop', c.onlineStoreHidden], ['In webshop gezet', c.onlineStorePublished], ['Webshop: mislukt', c.onlineStorePublishFailed]] as [string, unknown, (ListKey | null)?][]).map(([label, value, target]) => {
              const body = <><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-bold">{value === undefined ? '—' : String(value)}</dd></>;
              if (target === undefined) return <div key={label} className="rounded-xl border p-3">{body}</div>;
              const active = (target ?? null) === view;
              return <Link key={label} href={back({ run: selected.id, ...(target ? { view: target } : {}) })} className={`rounded-xl border p-3 hover:border-sky-400 ${active ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : ''}`}>{body}<span className="text-xs text-sky-700">{active ? 'getoond' : 'toon lijst'}</span></Link>;
            })}
          </dl>
          {typeof c.missingBlocked === 'string' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{c.missingBlocked}</p>}
          {Number(c.missingHeld ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {String(c.missingHeld)} artikelen die niet meer in het ERP staan, worden vastgehouden (verdacht veel tegelijk verdwenen). Ze worden niet op 0 gezet of gearchiveerd. Staan ze terug in het ERP, dan verdwijnt dit vanzelf.
              {isAdmin && (
                <form action={releaseMissingAction} className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> Ik heb de ERP-export gecontroleerd; deze artikelen zijn echt weg</label>
                  <button className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white">Vrijgeven</button>
                </form>
              )}
            </div>
          )}
          {typeof c.onlineStorePublish === 'string' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Online Store: {c.onlineStorePublish}. Actieve producten worden pas automatisch in de webshop gezet als de app de rechten read_publications en write_publications heeft.</p>}
          {Array.isArray(c.onlineStorePublishErrors) && c.onlineStorePublishErrors.length > 0 && <p className="mt-3 text-sm text-red-700">Niet in de webshop gezet: {(c.onlineStorePublishErrors as string[]).join(' · ')}</p>}
          {typeof c.createBlocked === 'string' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{c.createBlocked}</p>}
          {Number(c.newDraftsPending ?? 0) > 0 && <p className="mt-3 text-sm text-slate-600">Nog {String(c.newDraftsPending)} nieuwe artikelen volgen in de volgende runs.</p>}
          {Array.isArray(c.newSkipped) && c.newSkipped.length > 0 && <p className="mt-3 text-sm text-slate-600">Niet aangemaakt: {(c.newSkipped as { sku: string; reason: string }[]).slice(0, 20).map(x => `${x.sku} (${x.reason})`).join(', ')}{c.newSkipped.length > 20 ? ' …' : ''}</p>}
          {Array.isArray(c.unknownLocations) && c.unknownLocations.length > 0 && <p className="mt-3 text-sm text-amber-700">Onbekende locaties in de CSV: {(c.unknownLocations as string[]).join(', ')}</p>}
          {view ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                <h3 className="font-semibold">{LISTS[view].label} ({unmatched.length}{q ? ` van ${allUnmatched.length}` : ''})</h3>
                <form className="flex gap-2">
                  <input type="hidden" name="run" value={selected.id} />
                  <input type="hidden" name="view" value={view} />
                  <input name="q" defaultValue={params.q ?? ''} placeholder="Zoek SKU of titel" className="rounded-lg border px-3 py-1.5" />
                  <button className="rounded-lg border px-3 py-1.5 font-semibold hover:bg-slate-50">Zoeken</button>
                </form>
                <Link href={back({ run: selected.id })} className="text-sky-700 hover:underline">Terug naar wijzigingen</Link>
              </div>
              <p className="mt-1 text-xs text-slate-500">{LISTS[view].help}</p>
              {(() => { const selectable = (view === 'shopifyOnly' || view === 'shopifyArchived') && isAdmin; const seenProducts = new Set<string>(); const table = (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr>{selectable && <th className="py-2 pr-2"></th>}<th className="py-2 pr-4">SKU</th><th className="pr-4">Titel</th>{(view === 'shopifyOnly' || view === 'shopifyArchived') && <th className="pr-4">Status</th>}{view === 'dupTitles' && <><th className="pr-4 text-right">Prijs</th><th className="pr-4">Status</th></>}{stores.map(st => <th key={st} className="pr-4 text-right">{storeLabel(st)}</th>)}<th className="pr-4 text-right">Totaal</th><th>{view === 'erpOnly' ? '' : 'Shopify'}</th></tr></thead>
                  <tbody className="divide-y">
                    {unmatched.map(u => {
                      const url = productUrl(u.productId);
                      return (
                        <tr key={u.sku}>
                          {selectable && <td className="py-1.5 pr-2">{u.productId && !seenProducts.has(u.productId) && (seenProducts.add(u.productId), <input type="checkbox" name="ids" value={u.productId} aria-label={`Selecteer ${u.sku}`} />)}</td>}
                          <td className="py-1.5 pr-4 font-mono">{u.sku}</td>
                          <td className="pr-4">{u.title || '—'}</td>
                          {(view === 'shopifyOnly' || view === 'shopifyArchived') && <td className="pr-4">{u.status === 'ARCHIVED' ? 'gearchiveerd' : u.status === 'DRAFT' ? 'concept' : u.status === 'ACTIVE' ? 'actief' : '—'}</td>}
                          {view === 'dupTitles' && <><td className="pr-4 text-right tabular-nums">{typeof u.priceCents === 'number' ? (u.priceCents / 100).toFixed(2).replace('.', ',') : '—'}</td><td className="pr-4">{u.status ? u.status.toLowerCase() : '—'}</td></>}
                          {stores.map(st => <td key={st} className="pr-4 text-right tabular-nums">{u.inventory?.[st] ?? '—'}</td>)}
                          <td className={`pr-4 text-right font-semibold tabular-nums ${total(u) > 0 ? 'text-green-700' : 'text-slate-400'}`}>{total(u)}</td>
                          <td>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">openen</a>}</td>
                        </tr>
                      );
                    })}
                    {!unmatched.length && <tr><td colSpan={4 + stores.length + (view === 'dupTitles' ? 2 : 0) + (view === 'shopifyOnly' || view === 'shopifyArchived' ? 1 : 0) + (selectable ? 1 : 0)} className="py-3 text-slate-500">{!Array.isArray(c[LISTS[view].key]) ? 'Deze run is van vóór de lijsten; voer een nieuwe run uit.' : allUnmatched.length ? 'Geen resultaten voor deze zoekopdracht.' : 'Geen artikelen.'}</td></tr>}
                  </tbody>
                </table>
              </div>
              );
              if (!selectable) return table;
              return (
                <form action={removalAction} className="mt-2">
                  <input type="hidden" name="run" value={selected.id} />
                  <input type="hidden" name="view" value={view} />
                  {table}
                  <div className="mt-4 space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
                    <p className="font-semibold">Geselecteerde producten (max. {MAX_PER_ACTION})</p>
                    <p className="text-xs text-slate-600">Vlak voor de actie controleert de tool opnieuw in Shopify en in de laatste ERP-import. Producten waarvan nog een SKU in het ERP staat, worden altijd overgeslagen.</p>
                    {view === 'shopifyOnly' && <label className="flex items-center gap-2"><input type="checkbox" name="include_stock" /> Ook producten met voorraad archiveren</label>}
                    <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> Ik bevestig deze actie</label>
                    <div className="flex flex-wrap gap-2">
                      {view === 'shopifyOnly' && <button name="removal" value="archive" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Archiveren</button>}
                      <button name="removal" value="restore" className="rounded-lg border px-4 py-2 font-semibold hover:bg-white">Terugzetten als concept</button>
                    </div>
                  </div>
                </form>
              ); })()}
            </>
          ) : (
            <>
          <div className="mt-6 flex items-center gap-3 text-sm">
            <h3 className="font-semibold">Wijzigingen{Number(c.changes ?? 0) > 300 ? ' (eerste 300)' : ''}</h3>
            <Link href={back({ run: selected.id, ...(onlyErrors ? {} : { errors: '1' }) })} className="text-sky-700 hover:underline">{onlyErrors ? 'Alles tonen' : 'Alleen fouten'}</Link>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">SKU</th><th className="pr-4">Veld</th><th className="pr-4">Shopify nu</th><th className="pr-4">ERP</th><th>Status</th></tr></thead>
              <tbody className="divide-y">
                {(changes ?? []).map(ch => (
                  <tr key={ch.id}>
                    <td className="py-1.5 pr-4 font-mono">{ch.sku}</td>
                    <td className="pr-4">{ch.field}</td>
                    <td className="pr-4 text-slate-500">{ch.old_value ?? '—'}</td>
                    <td className="pr-4">{ch.new_value ?? '—'}</td>
                    <td>{ch.error ? <span className="text-red-700">{ch.error}</span> : ch.applied ? 'toegepast' : selected.mode === 'shadow' ? 'alleen vergeleken' : 'niet toegepast'}</td>
                  </tr>
                ))}
                {!changes?.length && <tr><td colSpan={5} className="py-3 text-slate-500">Geen wijzigingen.</td></tr>}
              </tbody>
            </table>
          </div>
            </>
          )}
        </section>
      )}
      {isAdmin && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Gearchiveerd via deze tool ({archivedList.length})</h2>
          <p className="mt-1 text-sm text-slate-600">Definitief verwijderen kan pas {DELETE_AFTER_DAYS} dagen na het archiveren. Verwijderen kan niet ongedaan worden gemaakt; oude bestellingen blijven wel bewaard. Bij het archiveren krijgt de oude productpagina meteen een 301-doorverwijzing: naar hetzelfde model in een andere graad dat op voorraad is, anders naar de collectie. Terugzetten haalt die doorverwijzing weer weg.</p>
          <form action={redirectBacklogAction} className="mt-3">
            {params.backlog && params.remaining === '1' && params.after && <input type="hidden" name="after" value={params.after} />}
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Doorverwijzingen aanmaken voor gearchiveerde producten zonder doorverwijzing</button>
          </form>
          <form action={removalAction} className="mt-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-2"></th><th className="pr-4">Titel</th><th className="pr-4">SKU</th><th className="pr-4">Gearchiveerd</th><th>Verwijderen mogelijk</th></tr></thead>
                <tbody className="divide-y">
                  {archivedList.map(r => {
                    const days = daysSince(r.created_at);
                    const ready = days >= DELETE_AFTER_DAYS;
                    return (
                      <tr key={r.product_id}>
                        <td className="py-1.5 pr-2"><input type="checkbox" name="ids" value={r.product_id} aria-label={`Selecteer ${r.title}`} /></td>
                        <td className="pr-4">{r.title}</td>
                        <td className="pr-4 font-mono">{(r.skus ?? []).join(', ') || '—'}</td>
                        <td className="pr-4">{fmt(r.created_at)}</td>
                        <td className={ready ? 'text-green-700' : 'text-slate-500'}>{ready ? 'ja' : `over ${DELETE_AFTER_DAYS - days} dagen`}</td>
                      </tr>
                    );
                  })}
                  {!archivedList.length && <tr><td colSpan={5} className="py-3 text-slate-500">Nog niets gearchiveerd.</td></tr>}
                </tbody>
              </table>
            </div>
            {archivedList.length > 0 && (
              <div className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
                <p className="text-xs text-slate-600">De voorraad wordt vlak voor het verwijderen opnieuw gecontroleerd; producten die intussen weer voorraad hebben, worden overgeslagen tenzij je hieronder bewust toestemming geeft.</p>
                <label className="flex items-center gap-2"><input type="checkbox" name="include_stock" /> Ook producten met voorraad verwijderen</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> Ik bevestig deze actie</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button name="removal" value="restore" className="rounded-lg border bg-white px-4 py-2 font-semibold">Terugzetten als concept</button>
                  <input name="confirm_text" placeholder="Typ VERWIJDER" className="rounded-lg border px-3 py-2" autoComplete="off" />
                  <button name="removal" value="delete" className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">Definitief verwijderen</button>
                </div>
              </div>
            )}
          </form>

          <h3 className="mt-8 font-semibold">Logboek opruimen (laatste 30)</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Wanneer</th><th className="pr-4">Actie</th><th className="pr-4">Titel</th><th className="pr-4">Resultaat</th><th className="pr-4">Door</th><th>Details</th></tr></thead>
              <tbody className="divide-y">
                {(removalRows ?? []).map(r => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-4">{fmt(r.created_at)}</td>
                    <td className="pr-4">{{ archive: 'archiveren', restore: 'terugzetten', delete: 'verwijderen' }[r.action as string] ?? r.action}</td>
                    <td className="pr-4">{r.title}</td>
                    <td className={`pr-4 ${r.result === 'ok' ? 'text-green-700' : r.result === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>{{ ok: 'gelukt', refused: 'overgeslagen', failed: 'mislukt' }[r.result as string] ?? r.result}</td>
                    <td className="pr-4">{r.actor}</td>
                    <td className="text-slate-600">{[r.detail, r.redirect].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
                {!removalRows?.length && <tr><td colSpan={6} className="py-3 text-slate-500">Nog geen acties.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
