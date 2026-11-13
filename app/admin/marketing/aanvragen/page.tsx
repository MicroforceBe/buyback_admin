// Verwittigingen "Op aanvraag" (MacBook- en iPhone-modelpagina's van microforce.be): welke configuraties klanten zoeken, in welke
// minimale staat, sinds wanneer, en hoeveel klanten de laatste 30 dagen gemaild werden. Alleen lezen.
// Namen en e-mailadressen ziet alleen een beheerder. Code: lib/stockRequests, docs/marketing.md.
import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { collectionName, configLabel, demandSummary, GRADE, gradesLabel, type DemandRow } from '@/lib/stockRequests/core';

export const dynamic = 'force-dynamic';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short' }) : '—');
const STATUS: Record<string, string> = { open: 'open', notified: 'verwittigd', unsubscribed: 'uitgeschreven', expired: 'verlopen' };

export default async function AanvragenPage() {
  const user = await requirePageAccess('erp');
  const isAdmin = String((user as { role?: string }).role ?? '').toLowerCase() === 'admin';
  const { data, error } = await supabaseAdmin.from('shop_stock_requests')
    .select('collection_handle,config_key,grades,status,created_at,notified_at').order('created_at', { ascending: false }).limit(5000);
  const rows = (data ?? []) as DemandRow[];
  const demand = demandSummary(rows);
  const openCount = rows.filter(r => r.status === 'open').length;
  const people = isAdmin
    ? ((await supabaseAdmin.from('shop_stock_requests').select('created_at,name,email,language,collection_handle,config_key,grades,status,notified_at,notified_handle')
      .order('created_at', { ascending: false }).limit(200)).data ?? [])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/marketing" className="text-sm text-sky-700 hover:underline">← Marketing</Link>
        <h1 className="mt-1 text-2xl font-bold">Aanvragen "Op aanvraag"</h1>
        <p className="text-sm text-slate-500">Klanten die een mail vroegen zodra een MacBook- of iPhone-configuratie terug op voorraad is. Elk uur wordt gecontroleerd; een aanvraag blijft 6 maanden open.</p>
      </div>
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">De aanvragen konden niet gelezen worden. Is <code>security/sql/shop-stock-requests.sql</code> al toegepast?</p>}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between"><h2 className="font-semibold">Vraag per configuratie</h2><span className="text-xs text-slate-500">{openCount} open aanvragen</span></div>
        {demand.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 pr-3">Model</th><th className="pr-3">Configuratie</th><th className="pr-3 text-right">Open</th>
                <th className="pr-3">Per aanvaarde staat</th><th className="pr-3">Oudste</th><th className="text-right">Verwittigd (30 d)</th></tr></thead>
              <tbody>
                {demand.map(d => (
                  <tr key={d.collection + d.config} className="border-t">
                    <td className="py-2 pr-3">{collectionName(d.collection)}</td>
                    <td className="pr-3 font-medium">{configLabel(d.config, 'nl')}</td>
                    <td className="pr-3 text-right text-lg font-bold">{d.open}</td>
                    <td className="pr-3 text-xs text-slate-600">{([3, 4, 5] as const).filter(g => d.byGrade[g]).map(g => `${GRADE.nl[g]}: ${d.byGrade[g]}`).join(' · ') || '—'}</td>
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
