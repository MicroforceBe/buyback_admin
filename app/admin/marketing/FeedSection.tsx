// Own Google Merchant feed: status, last runs and (for admins) the settings. Replaces the Channable feed.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig } from '@/lib/shopify/client';
import { createFeedDataSourceAction, runFeedAction, saveFeedSettingsAction, saveStoreCodesAction } from './actions';

/** Active Shopify locations (name -> id), or null when Shopify is not reachable. */
async function shopifyLocations(): Promise<Record<string, string> | null> {
  try { const cfg = shopifyConfig(); return cfg ? await createShopifyClient(cfg).locations() : null; } catch { return null; }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short', timeStyle: 'short' });
const MODE: Record<string, string> = { off: 'Uit', test: 'Test (alleen testproducten, nergens zichtbaar)', live: 'Live (volledige feed)' };
const STATUS: Record<string, string> = { running: 'bezig', succeeded: 'gelukt', failed: 'fouten', stopped: 'gestopt' };
type Run = { id: string; mode: string; status: string; started_at: string; counts: Record<string, unknown>; error: string | null };

export default async function FeedSection({ isAdmin }: { isAdmin: boolean }) {
  const [{ data: settings, error }, { data: runs }, { count: live }, { count: test }] = await Promise.all([
    supabaseAdmin.from('merchant_feed_settings').select('mode,data_source,test_products,max_changes,store_codes,updated_at,updated_by').eq('id', true).maybeSingle(),
    supabaseAdmin.from('merchant_feed_runs').select('id,mode,status,started_at,counts,error').order('started_at', { ascending: false }).limit(5),
    supabaseAdmin.from('merchant_feed_items').select('offer_id', { count: 'exact', head: true }).eq('test', false),
    supabaseAdmin.from('merchant_feed_items').select('offer_id', { count: 'exact', head: true }).eq('test', true),
  ]);
  if (error || !settings) return <section className="rounded-2xl border bg-white p-5 text-sm text-slate-500 shadow-sm">Eigen Google-feed: nog niet geïnstalleerd (SQL ontbreekt).</section>;
  const last = (runs ?? []) as Run[];
  const storeCodes = (settings.store_codes ?? {}) as Record<string, string>;
  const locations = isAdmin ? await shopifyLocations() : null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Eigen Google-feed</h2>
        {isAdmin && settings.mode !== 'off' && <form action={runFeedAction}><button className="text-sm text-sky-700 hover:underline">Nu uitvoeren</button></form>}
      </div>
      <p className="text-xs text-slate-500"><a href="/admin/marketing/gtin" className="text-sky-700 hover:underline">Modellen & GTIN beheren →</a></p>
      <p className="text-xs text-slate-500">Vervangt Channable: actieve refurbished producten uit de webshop gaan elk kwartier rechtstreeks naar Merchant Center, met productgroepen (labels 0–4: soort, kwaliteit, prijsklasse, merk, voorraad).</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 text-sm shadow-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-slate-500">Modus</dt><dd className="font-semibold">{MODE[settings.mode] ?? settings.mode}</dd>
            <dt className="text-slate-500">Gegevensbron</dt><dd>{settings.data_source ?? <span className="text-slate-400">nog niet aangemaakt</span>}</dd>
            <dt className="text-slate-500">In Merchant Center</dt><dd>{live ?? 0} producten{test ? ` · ${test} test` : ''}</dd>
            <dt className="text-slate-500">Noodrem</dt><dd>max. {settings.max_changes} wijzigingen per run</dd>
            <dt className="text-slate-500">Voorraad per winkel</dt><dd>{Object.keys(storeCodes).length ? Object.values(storeCodes).join(', ') : <span className="text-slate-400">geen winkelcodes</span>}</dd>
          </dl>
          {isAdmin && settings.data_source && locations && (
            <form action={saveStoreCodesAction} className="mt-4 space-y-2 border-t pt-4">
              <div className="text-xs text-slate-500">Winkelcode per Shopify-locatie, zoals in Google Bedrijfsprofiel (⋮ → Bedrijfsprofielinstellingen → Geavanceerde instellingen). Leeg = geen voorraad per winkel naar Google.</div>
              {Object.entries(locations).map(([name, id]) => (
                <label key={id} className="flex items-center gap-3"><span className="w-48 text-sm">{name}</span>
                  <input name={`store:${id}`} defaultValue={storeCodes[id] ?? ''} maxLength={64} className="w-56 rounded-xl border px-3 py-1.5 font-mono text-xs" /></label>
              ))}
              <button className="rounded-xl border px-4 py-1.5 text-sm">Winkelcodes bewaren</button>
            </form>
          )}
          {isAdmin && !settings.data_source && (
            <form action={createFeedDataSourceAction} className="mt-4"><button className="rounded-xl bg-slate-900 px-4 py-2 text-white">Gegevensbron aanmaken in Merchant Center</button></form>
          )}
          {isAdmin && settings.data_source && (
            <form action={saveFeedSettingsAction} className="mt-4 space-y-3 border-t pt-4">
              <label className="block"><span className="text-xs text-slate-500">Modus</span>
                <select name="mode" defaultValue={settings.mode} className="mt-1 block w-full rounded-xl border px-3 py-2">
                  {Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="block"><span className="text-xs text-slate-500">Testproducten (Shopify-product-ID&apos;s of links, max. 20)</span>
                <textarea name="test_products" rows={2} defaultValue={(settings.test_products as string[]).map(id => id.replace('gid://shopify/Product/', '')).join(', ')} className="mt-1 block w-full rounded-xl border px-3 py-2 font-mono text-xs" /></label>
              <label className="block"><span className="text-xs text-slate-500">Noodrem: maximum wijzigingen per run</span>
                <input name="max_changes" type="number" min={1} max={100000} defaultValue={settings.max_changes} className="mt-1 block w-40 rounded-xl border px-3 py-2" /></label>
              <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" name="channable_off" className="mt-0.5" />
                <span>Voor live: de Google-kanalen in Channable staan uit en hun gegevensbron is uit Merchant Center verwijderd (anders staan de producten er dubbel).</span></label>
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-white">Bewaren</button>
            </form>
          )}
        </div>
        <div className="rounded-2xl border bg-white p-5 text-sm shadow-sm">
          <h3 className="font-semibold">Laatste runs</h3>
          {last.length ? (
            <ul className="mt-2 space-y-2">{last.map(r => {
              const c = r.counts ?? {};
              const reasons = (c.skippedReasons ?? {}) as Record<string, number>;
              const errors = (c.errors ?? []) as { offerId: string; reason: string }[];
              return (
                <li key={r.id} className="rounded-xl border p-3">
                  <div className="flex justify-between"><span>{fmt(r.started_at)} · {r.mode}</span><span className={r.status === 'succeeded' ? 'text-green-700' : r.status === 'running' ? 'text-slate-500' : 'text-red-700'}>{STATUS[r.status] ?? r.status}</span></div>
                  <div className="mt-1 text-xs text-slate-600">{String(c.offers ?? 0)} in de feed · {String(c.sent ?? 0)} verstuurd · {String(c.removed ?? 0)} verwijderd · {String(c.unchanged ?? 0)} ongewijzigd{Number(c.localSent ?? 0) ? ` · winkelvoorraad ${String(c.localSent)}` : ''}{Number(c.remaining ?? 0) ? ` · ${String(c.remaining)} volgende run` : ''}</div>
                  {Object.keys(reasons).length > 0 && <div className="mt-1 text-xs text-slate-500">Niet in de feed: {Object.entries(reasons).map(([k, n]) => `${n} ${k}`).join(' · ')}</div>}
                  {r.error && <div className="mt-1 text-xs text-red-700">{r.error}</div>}
                  {errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-700">{errors.slice(0, 5).map(e => <li key={e.offerId}>{e.offerId}: {e.reason}</li>)}</ul>}
                </li>
              );
            })}</ul>
          ) : <p className="mt-2 text-slate-500">Nog geen runs.</p>}
        </div>
      </div>
    </section>
  );
}
