// Shopify sync (replaces Matrixify): status, mode, safety brake, recent runs and their changes.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { shopifyConfig } from '@/lib/shopify/client';
import { MODES, PATH, back, type Mode } from './modes';
import { runNowAction, saveSettingsAction, stopAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;


const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' }) : '—');
const STATUS: Record<string, string> = { running: 'bezig', succeeded: 'geslaagd', failed: 'mislukt', stopped: 'noodrem' };
const STATUS_CLASS: Record<string, string> = { running: 'bg-sky-100 text-sky-800', succeeded: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800', stopped: 'bg-amber-100 text-amber-800' };

export default async function ShopifySyncPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageAccess('erp');
  const params = await searchParams;
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const configured = (() => { try { return shopifyConfig() !== null; } catch { return false; } })();

  const [{ data: settings }, { data: runs }] = await Promise.all([
    supabaseAdmin.from('shopify_sync_settings').select('mode,max_changes,version,updated_at,updated_by').eq('id', true).single(),
    supabaseAdmin.from('shopify_sync_runs').select('id,trigger,mode,status,started_at,finished_at,started_by,counts,error').order('started_at', { ascending: false }).limit(20),
  ]);
  const selectedId = params.run ?? runs?.[0]?.id;
  const selected = runs?.find(r => r.id === selectedId) ?? null;
  const onlyErrors = params.errors === '1';
  let changesQuery = supabaseAdmin.from('shopify_sync_changes').select('id,sku,scope,field,old_value,new_value,applied,error').eq('run_id', selectedId ?? '00000000-0000-0000-0000-000000000000').order('id').limit(300);
  if (onlyErrors) changesQuery = changesQuery.not('error', 'is', null);
  const { data: changes } = selected ? await changesQuery : { data: [] };
  const mode = (settings?.mode ?? 'off') as Mode;
  const c = (selected?.counts ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white shadow-sm">
        <Link href="/admin/erp" className="text-xs text-slate-400 hover:text-white">← ERP</Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Shopify-synchronisatie</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">Vervangt Matrixify. Elke 15 minuten (5 minuten na de ERP-import) vergelijken we de ERP-CSV met Shopify en schrijven we alleen wat verschilt: titel, merk, type, status, prijs, vergelijkingsprijs, btw, voorraad per winkel en vijf metavelden. Nieuwe of verdwenen artikelen worden niet aangemaakt of verwijderd.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${mode === 'live' ? 'bg-green-500 text-white' : mode === 'shadow' ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-200'}`}>Modus: {MODES[mode]}</span>
          <span className={`rounded-full px-3 py-1 ${configured ? 'bg-white/10' : 'bg-red-500/80'}`}>{configured ? 'Shopify gekoppeld' : 'Shopify niet gekoppeld'}</span>
          {mode !== 'off' && <form action={stopAction}><button className="rounded-full bg-red-600 px-4 py-1 font-semibold text-white hover:bg-red-700">Noodstop: zet uit</button></form>}
        </div>
      </div>

      {params.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{params.error}</div>}
      {params.saved && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{params.saved === 'stop' ? 'De synchronisatie staat uit.' : 'Instellingen opgeslagen.'}</div>}

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
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Opslaan</button>
            </form>
          ) : <p className="mt-4 text-sm text-slate-600">Alleen beheerders wijzigen de modus. Noodrem: {settings?.max_changes} wijzigingen.</p>}
          <p className="mt-4 text-xs text-slate-500">Laatst gewijzigd {fmt(settings?.updated_at ?? null)} door {settings?.updated_by}.</p>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recente runs</h2>
            {isAdmin && mode !== 'off' && <form action={runNowAction}><button className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Nu uitvoeren</button></form>}
          </div>
          <ul className="mt-4 divide-y text-sm">
            {(runs ?? []).map(r => (
              <li key={r.id} className={`flex items-center justify-between py-2 ${r.id === selectedId ? 'font-semibold' : ''}`}>
                <Link href={back({ run: r.id })} className="hover:underline">{fmt(r.started_at)} · {r.trigger === 'cron' ? 'automatisch' : `handmatig (${r.started_by})`} · {r.mode === 'live' ? 'live' : 'schaduw'}</Link>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status] ?? ''}`}>{STATUS[r.status] ?? r.status}</span>
              </li>
            ))}
            {!runs?.length && <li className="py-2 text-slate-500">Nog geen runs.</li>}
          </ul>
        </section>
      </div>

      {selected && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Run van {fmt(selected.started_at)}</h2>
          {selected.error && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">{selected.error}</p>}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {([['ERP-regels', c.erpRows], ['Gekoppeld', c.matched], ['Ongewijzigd', c.unchanged], ['Wijzigingen', c.changes], ['Alleen in ERP', c.erpOnly], ['Alleen in Shopify', c.shopifyOnly], ['Dubbele SKU in Shopify', c.duplicateSkus], ['Niet op locatie', c.notStocked], ['Productconflicten', c.productConflicts], ['Ongeldige rijen', c.invalidRows], ['Mislukte SKU’s', c.failedSkus]] as [string, unknown][]).map(([label, value]) => (
              <div key={label} className="rounded-xl border p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-bold">{value === undefined ? '—' : String(value)}</dd></div>
            ))}
          </dl>
          {Array.isArray(c.unknownLocations) && c.unknownLocations.length > 0 && <p className="mt-3 text-sm text-amber-700">Onbekende locaties in de CSV: {(c.unknownLocations as string[]).join(', ')}</p>}
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
        </section>
      )}
    </div>
  );
}
