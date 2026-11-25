// Inkoopvraag: de verwittigingen "Op aanvraag" (MacBook-, iPhone-, Samsung- en iPad-modelpagina's van microforce.be) als input voor de inkoop.
// Per model: open aanvragen, unieke klanten, gevraagde configuraties. Per configuratie: in welke staat, sinds wanneer, hoeveel klanten gemaild (30 d). Alleen lezen.
// Namen en e-mailadressen ziet alleen een beheerder. Code: lib/stockRequests, docs/marketing.md.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { collectionName, configLabel, demandSummary, GRADE, gradesLabel, modelDemand, type ModelDemandRow } from '@/lib/stockRequests/core';

export const dynamic = 'force-dynamic';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short' }) : '—');
const STATUS: Record<string, string> = { open: 'open', notified: 'verwittigd', unsubscribed: 'uitgeschreven', expired: 'verlopen' };

export default async function InkoopvraagPage() {
  const user = await requirePageAccess('erp');
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const { data, error } = await supabaseAdmin.from('shop_stock_requests')
    .select('collection_handle,config_key,grades,status,created_at,notified_at,email').order('created_at', { ascending: false }).limit(5000);
  const rows = (data ?? []) as ModelDemandRow[];
  const demand = demandSummary(rows);
  const models = modelDemand(rows);
  const open = rows.filter(r => r.status === 'open');
  const openCount = open.length;
  const customers = new Set(open.map(r => (r.email ?? '').trim().toLowerCase()).filter(Boolean)).size;
  const week = Date.now() - 7 * 86400_000;
  const last7 = rows.filter(r => Date.parse(r.created_at) >= week).length;
  const notified30 = demand.reduce((n, d) => n + d.notified30, 0);
  const perConfig = new Map<string, Set<string>>();
  for (const r of open) { const k = r.collection_handle + '|' + r.config_key; const s = perConfig.get(k) ?? new Set<string>(); if (r.email) s.add(r.email.trim().toLowerCase()); perConfig.set(k, s); }
  const people = isAdmin
    ? ((await supabaseAdmin.from('shop_stock_requests').select('created_at,name,email,language,collection_handle,config_key,grades,status,notified_at,notified_handle')
      .order('created_at', { ascending: false }).limit(200)).data ?? [])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inkoopvraag</h1>
        <p className="text-sm text-slate-500">Wat klanten zoeken en wij niet op voorraad hebben: aanvragen &quot;Laat je verwittigen&quot; op de modelpagina&apos;s van microforce.be (MacBook, iPhone, Samsung, iPad). Elk uur wordt gecontroleerd of er een passend toestel online staat; dan krijgt de klant automatisch een mail. Een aanvraag blijft 6 maanden open.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {([['Open aanvragen', openCount], ['Klanten', customers], ['Nieuw (7 dagen)', last7], ['Verwittigd (30 dagen)', notified30]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div></div>
        ))}
      </div>
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">De aanvragen konden niet gelezen worden. Is <code>security/sql/shop-stock-requests.sql</code> al toegepast?</p>}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Vraag per model</h2>
        <p className="mt-1 text-xs text-slate-500">Gesorteerd op het aantal klanten. Eén klant kan meerdere configuraties aanvragen.</p>
        {models.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3">Model</th><th className="pr-3 text-right">Klanten</th><th className="pr-3 text-right">Aanvragen</th><th className="pr-3 text-right">Nieuw (7 d)</th><th className="pr-3">Gevraagde configuraties</th><th>Oudste</th></tr></thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.collection} className="border-t align-top">
                    <td className="py-2 pr-3 font-medium">{collectionName(m.collection)}</td>
                    <td className="pr-3 text-right text-lg font-bold">{m.customers}</td>
                    <td className="pr-3 text-right">{m.open}</td>
                    <td className="pr-3 text-right">{m.last7 || '—'}</td>
                    <td className="pr-3 text-xs text-slate-600">{m.configs.map(c => configLabel(c, 'nl')).join(' · ')}</td>
                    <td className="whitespace-nowrap">{fmt(m.oldest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-slate-500">Nog geen open aanvragen.</p>}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between"><h2 className="font-semibold">Vraag per configuratie</h2><span className="text-xs text-slate-500">{openCount} open aanvragen</span></div>
        {demand.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3">Model</th><th className="pr-3">Configuratie</th><th className="pr-3 text-right">Klanten</th><th className="pr-3 text-right">Open</th>
                <th className="pr-3">Per aanvaarde staat</th><th className="pr-3">Oudste</th><th className="text-right">Verwittigd (30 d)</th></tr></thead>
              <tbody>
                {demand.map(d => (
                  <tr key={d.collection + d.config} className="border-t">
                    <td className="py-2 pr-3">{collectionName(d.collection)}</td>
                    <td className="pr-3 font-medium">{configLabel(d.config, 'nl')}</td>
                    <td className="pr-3 text-right text-lg font-bold">{perConfig.get(d.collection + '|' + d.config)?.size ?? 0}</td>
                    <td className="pr-3 text-right">{d.open}</td>
                    <td className="pr-3 text-xs text-slate-600">{([3, 4, 5, 6] as const).filter(g => d.byGrade[g]).map(g => `${GRADE.nl[g]}: ${d.byGrade[g]}`).join(' · ') || '—'}</td>
                    <td className="pr-3">{fmt(d.oldest)}</td>
                    <td className="text-right">{d.notified30 || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-slate-500">Nog geen aanvragen.</p>}
      </section>

      {isAdmin && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Laatste 200 aanvragen</h2>
          <p className="mt-1 text-xs text-slate-500">Alleen zichtbaar voor beheerders. Gebruik deze gegevens alleen voor de verwittiging waarvoor de klant toestemming gaf.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3">Datum</th><th className="pr-3">Klant</th><th className="pr-3">Taal</th><th className="pr-3">Configuratie</th><th className="pr-3">Staat</th><th>Status</th></tr></thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmt(p.created_at)}</td>
                    <td className="pr-3">{p.name}<div className="text-xs text-slate-500">{p.email}</div></td>
                    <td className="pr-3 uppercase">{p.language}</td>
                    <td className="pr-3">{collectionName(p.collection_handle)}<div className="text-xs text-slate-500">{configLabel(p.config_key, 'nl')}</div></td>
                    <td className="pr-3">{gradesLabel(p.grades ?? [], 'nl') ?? 'elke'}</td>
                    <td>{STATUS[p.status] ?? p.status}{p.status === 'notified' && <div className="text-xs text-slate-500">{fmt(p.notified_at)}{p.notified_handle ? <> · <a className="text-sky-700 hover:underline" href={`https://microforce.be/products/${encodeURIComponent(p.notified_handle)}`} target="_blank" rel="noreferrer">toestel</a></> : null}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
