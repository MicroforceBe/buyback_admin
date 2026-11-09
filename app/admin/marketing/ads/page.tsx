// Google Ads audit (read-only): last 30 days per campaign, device, search term and product, plus the
// conversion actions. Nothing is changed in Google Ads from this page.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { adsTotals } from '@/lib/marketing/googleAdsData';
import { refreshGoogleAction } from '../actions';
import { loadAds } from '../adsLoad';

export const dynamic = 'force-dynamic';
const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
const roas = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')}×`);
const money = (v: number | null) => (v === null ? '—' : eur.format(v));
const CHANNELS: Record<string, string> = { SEARCH: 'Zoeken', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'Performance Max', DISPLAY: 'Display', VIDEO: 'Video', LOCAL: 'Lokaal', DEMAND_GEN: 'Demand Gen', SMART: 'Smart' };
const STATUS: Record<string, string> = { ENABLED: 'actief', PAUSED: 'gepauzeerd' };

function Card({ title, note, error, children }: { title: string; note?: string; error?: string | null; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      {error ? <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : <div className="mt-3 overflow-x-auto">{children}</div>}
    </section>
  );
}

export default async function AdsPage() {
  const user = await requirePageAccess('erp');
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const a = await loadAds();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <Link href="/admin/marketing" className="text-sm text-sky-700 hover:underline">← Marketing</Link>
          <h1 className="mt-1 text-2xl font-bold">Google Ads-audit</h1>
          <p className="text-sm text-slate-500">Laatste 30 dagen. Alleen lezen: deze pagina wijzigt niets in Google Ads. Cijfers worden een uur bewaard.</p>
        </div>
        {isAdmin && <form action={refreshGoogleAction}><button className="text-sm text-sky-700 hover:underline">Vernieuwen</button></form>}
      </div>

      {!a && <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Google Ads is nog niet gekoppeld: de instelling GOOGLE_ADS_CUSTOMER_ID (klant-ID) of het serviceaccount ontbreekt.</p>}
      {a && 'settingsError' in a && <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{a.settingsError}</p>}

      {a && !('settingsError' in a) && (() => {
        const camps = a.campaigns?.ok ? a.campaigns.data : [];
        const t = adsTotals(camps);
        return (
          <>
            {a.campaigns?.ok && (
              <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-6">
                {([['Kosten', money(t.cost)], ['Klikken', nf.format(t.clicks)], ['Conversies', nf.format(t.conversions)], ['Conversiewaarde', money(t.value)], ['ROAS', roas(t.roas)], ['Kost per conversie', money(t.cpa)]] as const).map(([l, v]) => (
                  <div key={l}><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold">{v}</div></div>
                ))}
              </div>
            )}

            <Card title="Campagnes" note="Vertoningsaandeel en verlies door budget of rangschikking bestaan alleen voor Zoeken en Shopping." error={a.campaigns && !a.campaigns.ok ? a.campaigns.error : null}>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Campagne</th><th className="pr-3">Type</th><th className="pr-3 text-right">Budget/dag</th><th className="pr-3 text-right">Kosten</th><th className="pr-3 text-right">Klikken</th><th className="pr-3 text-right">Conv.</th><th className="pr-3 text-right">ROAS</th><th className="pr-3 text-right">Vert.aandeel</th><th className="pr-3 text-right">Verlies budget</th><th className="text-right">Verlies rang</th></tr></thead>
                <tbody className="divide-y">
                  {camps.map(c => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">{c.name}<span className="ml-2 text-xs text-slate-400">{STATUS[c.status] ?? c.status.toLowerCase()}</span></td>
                      <td className="pr-3">{CHANNELS[c.channel] ?? c.channel}</td>
                      <td className="pr-3 text-right">{money(c.dailyBudget)}</td>
                      <td className="pr-3 text-right">{money(c.cost)}</td>
                      <td className="pr-3 text-right">{nf.format(c.clicks)}</td>
                      <td className="pr-3 text-right">{nf.format(c.conversions)}</td>
                      <td className="pr-3 text-right">{roas(c.roas)}</td>
                      <td className="pr-3 text-right">{pct(c.impressionShare)}</td>
                      <td className={`pr-3 text-right ${c.lostBudget !== null && c.lostBudget > 0.2 ? 'font-semibold text-amber-700' : ''}`}>{pct(c.lostBudget)}</td>
                      <td className={`text-right ${c.lostRank !== null && c.lostRank > 0.4 ? 'font-semibold text-amber-700' : ''}`}>{pct(c.lostRank)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.shareError && <p className="mt-2 text-xs text-slate-500">Vertoningsaandeel niet beschikbaar: {a.shareError}</p>}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Per apparaat" error={a.devices && !a.devices.ok ? a.devices.error : null}>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Apparaat</th><th className="pr-3 text-right">Vertoningen</th><th className="pr-3 text-right">Kosten</th><th className="pr-3 text-right">Conv.ratio</th><th className="text-right">ROAS</th></tr></thead>
                  <tbody className="divide-y">{a.devices?.ok && a.devices.data.map(d => (
                    <tr key={d.device}><td className="py-2 pr-3">{d.label}</td><td className="pr-3 text-right">{nf.format(d.impressions)}</td><td className="pr-3 text-right">{money(d.cost)}</td><td className="pr-3 text-right">{pct(d.convRate)}</td><td className="text-right">{roas(d.roas)}</td></tr>
                  ))}</tbody>
                </table>
              </Card>

              <Card title="Conversieacties" note="Wat Google als verkoop telt. Alleen primaire acties sturen de biedstrategie." error={a.conversions && !a.conversions.ok ? a.conversions.error : null}>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Actie</th><th className="pr-3">Categorie</th><th>Primair</th></tr></thead>
                  <tbody className="divide-y">{a.conversions?.ok && a.conversions.data.map(c => (
                    <tr key={c.name}><td className="py-2 pr-3">{c.name}</td><td className="pr-3 text-slate-600">{c.category.toLowerCase().replace(/_/g, ' ')}</td><td>{c.primary ? 'ja' : 'nee'}</td></tr>
                  ))}</tbody>
                </table>
              </Card>
            </div>

            <Card title="Zoektermen die geld kosten zonder conversie" note="Zoekcampagnes, minstens € 5 kosten in 30 dagen. Kandidaten voor uitsluitende zoekwoorden." error={a.terms && !a.terms.ok ? a.terms.error : null}>
              {a.terms?.ok && (a.terms.data.waste.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Zoekterm</th><th className="pr-3">Campagne</th><th className="pr-3 text-right">Kosten</th><th className="text-right">Klikken</th></tr></thead>
                  <tbody className="divide-y">{a.terms.data.waste.map(w => (
                    <tr key={w.term + w.campaign}><td className="py-2 pr-3">{w.term}</td><td className="pr-3 text-slate-600">{w.campaign}</td><td className="pr-3 text-right">{money(w.cost)}</td><td className="text-right">{nf.format(w.clicks)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-sm text-slate-500">Geen zoektermen met minstens € 5 kosten en zonder conversie.</p>)}
            </Card>

            <Card title="Producten met de hoogste kosten (Shopping / Performance Max)" error={a.products && !a.products.ok ? a.products.error : null}>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Product</th><th className="pr-3 text-right">Kosten</th><th className="pr-3 text-right">Klikken</th><th className="pr-3 text-right">Conv.</th><th className="text-right">ROAS</th></tr></thead>
                <tbody className="divide-y">{a.products?.ok && a.products.data.map(p => (
                  <tr key={p.offerId + p.title}><td className="max-w-[28rem] truncate py-2 pr-3" title={p.offerId}>{p.title || p.offerId}</td><td className="pr-3 text-right">{money(p.cost)}</td><td className="pr-3 text-right">{nf.format(p.clicks)}</td><td className="pr-3 text-right">{nf.format(p.conversions)}</td><td className="text-right">{roas(p.roas)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          </>
        );
      })()}
    </div>
  );
}
