// app/admin/catalog/page.tsx
import { supabaseServer } from '@/lib/supabaseServer';

export const metadata = {
  title: 'Catalogus — Buyback Admin'
};

export default async function Page() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('buyback_catalog_api')
    .select('*')
    .order('brand')
    .order('model')
    .order('variant')
    .order('capacity_gb');

  if (error) {
    return (
      <main className="p-6">
        <h2 className="text-lg font-semibold mb-3">Catalogus</h2>
        <pre className="text-red-600 p-4 bg-red-50 rounded">DB error: {error.message}</pre>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h2 className="text-lg font-semibold mb-3">Catalogus (read-only start)</h2>
      <div className="overflow-auto border rounded">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['brand','model','variant','capacity_gb','base_price_cents'].map(h => (
                <th key={h} className="text-left p-2 border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="p-2 border-b">{r.brand}</td>
                <td className="p-2 border-b">{r.model}</td>
                <td className="p-2 border-b">{r.variant}</td>
                <td className="p-2 border-b">{r.capacity_gb}</td>
                <td className="p-2 border-b">€ {(r.base_price_cents/100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-gray-600">We maken dit hierna inline-editable.</p>
    </main>
  );
}
