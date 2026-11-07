// Google block of the marketing overview: Search Console, Analytics 4 and Merchant Center, each cached for
// an hour; a source that fails shows its error without breaking the rest of the page.
import type { ReactNode } from 'react';
import { change, isMerchantUnregistered, merchantIssueLabel, MERCHANT_STATUS_LABELS, pageLabel } from '@/lib/marketing/googleData';
import { refreshGoogleAction, registerMerchantAction } from './actions';
import { loadGoogle } from './googleLoad';
const nf = new Intl.NumberFormat('nl-BE');
const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const c = change(now, before);
  if (c === null) return null;
  const good = invert ? c < 0 : c > 0;
  return <span className={`ml-2 text-xs font-semibold ${c === 0 ? 'text-slate-400' : good ? 'text-green-700' : 'text-red-700'}`}>{c > 0 ? `+${c}` : c}%</span>;
}

function Card({ title, children, error }: { title: string; children?: ReactNode; error?: string | null }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {error ? <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : <div className="mt-3">{children}</div>}
    </div>
  );
}

export default async function GoogleSection({ isAdmin }: { isAdmin: boolean }) {
  const g = await loadGoogle();
  if (!g) return null;
  if ('settingsError' in g) return <Card title="Google" error={g.settingsError} />;
  const { gsc, ga, mc } = g;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Google</h2>
        {isAdmin && <form action={refreshGoogleAction}><button className="text-sm text-sky-700 hover:underline">Vernieuwen</button></form>}
      </div>
      <p className="text-xs text-slate-500">Cijfers worden een uur bewaard. Serviceaccount: {g.serviceAccount}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {gsc && (gsc.ok ? (
          <Card title={`Search Console · organisch, ${gsc.data.window.start} t/m ${gsc.data.window.end}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><div className="text-xs text-slate-500">Klikken</div><div className="text-xl font-bold">{nf.format(gsc.data.current.clicks)}<Delta now={gsc.data.current.clicks} before={gsc.data.previous.clicks} /></div></div>
              <div><div className="text-xs text-slate-500">Vertoningen</div><div className="text-xl font-bold">{nf.format(gsc.data.current.impressions)}<Delta now={gsc.data.current.impressions} before={gsc.data.previous.impressions} /></div></div>
              <div><div className="text-xs text-slate-500">CTR</div><div className="text-xl font-bold">{pct(gsc.data.current.ctr)}</div></div>
              <div><div className="text-xs text-slate-500">Gem. positie</div><div className="text-xl font-bold">{gsc.data.current.position.toFixed(1).replace('.', ',')}<Delta now={gsc.data.current.position} before={gsc.data.previous.position} invert /></div></div>
            </div>
            <p className="mt-1 text-xs text-slate-400">Verschil t.o.v. de 28 dagen ervoor. Een lagere positie is beter.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([['Top-zoektermen', gsc.data.queries], ['Top-pagina\'s', gsc.data.pages]] as const).map(([label, rows]) => (
                <div key={label}><div className="text-xs font-semibold text-slate-600">{label}</div>
                  <table className="mt-1 w-full text-xs"><tbody>{rows.map(r => <tr key={r.key} className="border-t"><td className="max-w-[14rem] truncate py-1 pr-2" title={r.key}>{label.includes('pagina') ? pageLabel(r.key) : r.key}</td><td className="text-right">{nf.format(r.clicks)}</td><td className="pl-2 text-right text-slate-400">#{r.position.toFixed(1).replace('.', ',')}</td></tr>)}</tbody></table>
                </div>
              ))}
            </div>
          </Card>
        ) : <Card title="Search Console" error={gsc.error} />)}

        {ga && (ga.ok ? (
          <Card title="Analytics 4 · laatste 28 dagen per kanaal">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Kanaal</th><th className="text-right">Sessies</th><th className="text-right">Gebruikers</th><th className="text-right">Conversies</th><th className="text-right">Omzet</th></tr></thead>
              <tbody>{ga.data.map(r => <tr key={r.channel} className="border-t"><td className="py-1">{r.channel}</td><td className="text-right">{nf.format(r.sessions)}</td><td className="text-right">{nf.format(r.users)}</td><td className="text-right">{nf.format(r.keyEvents)}</td><td className="text-right">{eur.format(r.revenue)}</td></tr>)}</tbody></table>
          </Card>
        ) : <Card title="Analytics 4" error={ga.error} />)}

        {mc && (mc.ok ? (
          <div id="merchant"><Card title={`Merchant Center · ${nf.format(mc.data.products)} producten`}>
            <div className="flex flex-wrap gap-2">{Object.entries(mc.data.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => <span key={s} className={`rounded-full px-3 py-1 text-sm ${s === 'NOT_ELIGIBLE_OR_DISAPPROVED' ? 'bg-red-100 text-red-800' : s === 'ELIGIBLE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}><b>{nf.format(n)}</b> {MERCHANT_STATUS_LABELS[s] ?? s}</span>)}</div>
            {mc.data.issues.length > 0 && <table className="mt-3 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1">Meest voorkomende problemen</th><th className="text-right">Producten</th></tr></thead>
              <tbody>{mc.data.issues.map(i => <tr key={i.code} className="border-t"><td className="py-1">{merchantIssueLabel(i.code)}{i.attribute ? <span className="text-slate-400"> · {i.attribute.toLowerCase()}</span> : null}</td><td className="text-right">{nf.format(i.products)}</td></tr>)}</tbody></table>}
          </Card></div>
        ) : (
          <Card title="Merchant Center" error={isMerchantUnregistered(mc.error) ? null : mc.error}>
            {isMerchantUnregistered(mc.error) && (
              <div className="space-y-2 text-sm">
                <p>Het Cloud-project moet eenmalig geregistreerd worden bij je Merchant Center-account. Daarvoor heeft het serviceaccount de rol <b>Beheerder</b> nodig in Merchant Center.</p>
                {isAdmin ? <form action={registerMerchantAction}><button className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white">Registreren (jij wordt technisch contact)</button></form> : <p className="text-slate-500">Een beheerder kan dit hier registreren.</p>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
