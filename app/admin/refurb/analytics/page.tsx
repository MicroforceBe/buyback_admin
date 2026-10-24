import Link from 'next/link';
import { requirePageAccess } from '@/lib/security/access';
import { buildRefurbAnalytics, parseAnalyticsFilters } from '@/lib/refurbAnalytics';
import { loadAnalyticsInput } from './data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const money = (cents: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const percent = (value: number) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 }).format(value) + '%';
const cell = 'border-b px-3 py-2';

function OpenSummary({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return <section className="rounded-md border bg-white p-3">
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {rows.length ? <div className="max-h-72 overflow-auto"><table className="w-full text-sm">
      <caption className="sr-only">{title}</caption>
      <thead><tr><th scope="col" className="pb-2 text-left">{title.replace('Per ', '')}</th><th scope="col" className="pb-2 text-right">Aantal</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.name} className="border-t"><th scope="row" className="py-1.5 text-left font-normal">{row.name}</th><td className="py-1.5 text-right tabular-nums">{row.count}</td></tr>)}</tbody>
    </table></div> : <p className="text-sm text-slate-500">Geen openstaande artikelen.</p>}
  </section>;
}

export default async function RefurbAnalyticsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess('refurb', true);
  const params = await searchParams ?? {};
  let filters;
  try { filters = parseAnalyticsFilters(params); }
  catch {
    return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">Kies een geldige periode met de begindatum vóór of op de einddatum. <Link href="/admin/refurb/analytics" className="underline">Filters wissen</Link></div>;
  }
  let input;
  try { input = await loadAnalyticsInput(); }
  catch {
    return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">Analytics kon niet volledig worden geladen. <Link href="/admin/refurb/analytics" className="underline">Probeer opnieuw</Link></div>;
  }
  const data = buildRefurbAnalytics(input, filters);
  const cards = [
    { label: 'Aangekocht', value: data.totals.purchased.toLocaleString('nl-BE') + ' artikelen' },
    { label: 'Aankoopbedrag', value: money(data.totals.purchaseCents) },
    { label: 'RMA nu', value: `${data.totals.rma} artikelen · ${percent(data.rmaPercent)}` },
    { label: 'Openstaand', value: data.totals.open.toLocaleString('nl-BE') + ' artikelen' },
  ];
  return <div className="space-y-5">
    <div><h1 className="text-lg font-semibold">Analytics</h1><p className="text-sm text-slate-500">Aankopen, RMA en openstaande refurb artikelen.</p></div>
    <form action="/admin/refurb/analytics" className="flex flex-wrap items-end gap-3 rounded-md border bg-white p-3">
      <label className="flex flex-col gap-1 text-xs">Vanaf receptiedatum<input type="date" name="from" defaultValue={filters.from} className="bb-input h-9 px-2" /></label>
      <label className="flex flex-col gap-1 text-xs">Tot en met<input type="date" name="to" defaultValue={filters.to} className="bb-input h-9 px-2" /></label>
      <label className="flex min-w-48 flex-col gap-1 text-xs">Leverancier<select name="supplier" defaultValue={filters.supplier} className="bb-input h-9 px-2"><option value="">Alle leveranciers</option>{data.availableSuppliers.map(supplier => <option key={supplier.key} value={supplier.key}>{supplier.name}</option>)}</select></label>
      <button type="submit" className="bb-btn bb-btn-primary text-sm">Toepassen</button>
      <Link href="/admin/refurb/analytics" prefetch={false} className="bb-btn text-sm">Filters wissen</Link>
    </form>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <div key={card.label} className="rounded-md border bg-white p-4"><div className="text-xs text-slate-500">{card.label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{card.value}</div></div>)}</div>
    <p className="text-xs text-slate-500">Zonder datumfilter: alle recepties. Elk artikel telt één keer. Bedragen zijn de opgeslagen aankoopprijzen, zonder btw-herberekening. RMA % = huidige status RMA / aangekochte artikelen binnen de gekozen receptieperiode; dit is geen historisch RMA-percentage.</p>
    {data.totals.missingPrices > 0 && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">Bij {data.totals.missingPrices} artikelen ontbreekt een aankoopprijs. Die bedragen zijn niet meegerekend.</p>}
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Aankopen en RMA per leverancier</h2>
      <div className="overflow-x-auto rounded-md border bg-white"><table className="w-full text-sm">
        <caption className="sr-only">Aankopen en RMA per leverancier binnen de geselecteerde periode</caption>
        <thead className="bg-slate-50"><tr>{['Leverancier', 'Recepties', 'Aangekocht', 'Aankoopbedrag', 'RMA nu', 'RMA %', 'Openstaand'].map((title, i) => <th key={title} scope="col" className={cell + (i ? ' text-right' : ' text-left')}>{title}</th>)}</tr></thead>
        <tbody>{data.supplierRows.map(row => <tr key={row.key}>
          <th scope="row" className={cell + ' text-left font-medium'}>{row.name}</th><td className={cell + ' text-right'}>{row.receptions}</td><td className={cell + ' text-right'}>{row.purchased}</td>
          <td className={cell + ' whitespace-nowrap text-right'}>{money(row.purchaseCents)}{row.missingPrices > 0 && <span className="block text-xs text-amber-700">{row.missingPrices} zonder prijs</span>}</td>
          <td className={cell + ' text-right'}>{row.rma}</td><td className={cell + ' text-right'}>{row.purchased ? percent(row.rmaPercent) : '—'}</td><td className={cell + ' text-right'}>{row.open}</td>
        </tr>)}{!data.supplierRows.length && <tr><td colSpan={7} className="p-5 text-center text-slate-500">Geen recepties binnen deze selectie.</td></tr>}</tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><th scope="row" className={cell + ' text-left'}>Totaal</th><td className={cell + ' text-right'}>{data.supplierRows.reduce((sum, row) => sum + row.receptions, 0)}</td><td className={cell + ' text-right'}>{data.totals.purchased}</td><td className={cell + ' whitespace-nowrap text-right'}>{money(data.totals.purchaseCents)}</td><td className={cell + ' text-right'}>{data.totals.rma}</td><td className={cell + ' text-right'}>{data.totals.purchased ? percent(data.rmaPercent) : '—'}</td><td className={cell + ' text-right'}>{data.totals.open}</td></tr></tfoot>
      </table></div>
    </section>
    <section className="space-y-3">
      <div><h2 className="text-base font-semibold">Openstaande artikelen</h2><p className="text-xs text-slate-500">Dezelfde eindstatussen als bij Recepties. Modelgroepen volgen de zoekwoorden onder Modellen; niet-herkende artikelen blijven meegeteld.</p></div>
      <div className="grid gap-3 lg:grid-cols-3"><OpenSummary title="Per model" rows={data.byModel} /><OpenSummary title="Per leverancier" rows={data.bySupplier} /><OpenSummary title="Per status" rows={data.byStatus} /></div>
      <div className="overflow-x-auto rounded-md border bg-white"><table className="w-full text-sm">
        <caption className="sr-only">Openstaande artikelen per model, leverancier en status</caption>
        <thead className="bg-slate-50"><tr>{['Model', 'Leverancier', 'Status', 'Aantal', 'Aankoopbedrag'].map((title, i) => <th key={title} scope="col" className={cell + (i > 2 ? ' text-right' : ' text-left')}>{title}</th>)}</tr></thead>
        <tbody>{data.openRows.map(row => <tr key={row.key}><th scope="row" className={cell + ' text-left font-medium'}>{row.model}</th><td className={cell}>{row.supplier}</td><td className={cell}>{row.status}</td><td className={cell + ' text-right'}>{row.count}</td><td className={cell + ' whitespace-nowrap text-right'}>{money(row.purchaseCents)}{row.missingPrices > 0 && <span className="block text-xs text-amber-700">{row.missingPrices} zonder prijs</span>}</td></tr>)}{!data.openRows.length && <tr><td colSpan={5} className="p-5 text-center text-slate-500">Geen openstaande artikelen binnen deze selectie.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
