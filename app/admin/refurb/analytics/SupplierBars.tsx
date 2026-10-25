type Row = { key: string; name: string; count: number; purchaseCents: number };

export default function SupplierBars({ rows, measure }: { rows: Row[]; measure: 'count' | 'value' }) {
  const value = (row: Row) => measure === 'count' ? row.count : row.purchaseCents;
  const ordered = [...rows].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, 'nl'));
  const maximum = Math.max(0, ...ordered.map(value));
  const format = (amount: number) => measure === 'count' ? amount.toLocaleString('nl-BE') + ' artikelen' : new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount / 100);
  return <figure className="rounded-md border bg-white p-4">
    <figcaption className="mb-4 text-sm font-semibold">{measure === 'count' ? 'Openstaande artikelen per leverancier' : 'Aankoopwaarde per leverancier'}</figcaption>
    {ordered.length ? <ul className="space-y-4">{ordered.map(row => <li key={row.key}>
      <div className="mb-1 flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{row.name}</span><span className="shrink-0 font-medium tabular-nums">{format(value(row))}</span></div>
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full ' + (measure === 'count' ? 'bg-sky-500' : 'bg-emerald-500')} style={{ width: `${maximum > 0 ? Math.max(0, value(row)) / maximum * 100 : 0}%` }} /></div>
    </li>)}</ul> : <p className="text-sm text-slate-500">Geen openstaande artikelen binnen deze selectie.</p>}
  </figure>;
}

