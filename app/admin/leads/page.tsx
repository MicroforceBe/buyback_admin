import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TinyLead = { id: string; order_code: string | null; created_at: string | null };

export default async function LeadsPage() {
  let data: TinyLead[] | null = null;
  let error: any = null;

  try {
    const res = await supabaseAdmin
      .from("buyback_leads")
      .select("id, order_code, created_at", { count: "exact", head: false })
      .order("created_at", { ascending: false })
      .limit(20);

    // Supabase JS client geeft { data, error, status }
    // We lezen alles defensief uit:
    // @ts-ignore
    data = res?.data ?? null;
    // @ts-ignore
    error = res?.error ?? null;

    // In edge case: als data undefined en geen error object, forceren we een faux error
    if (!data && !error) {
      throw new Error("Geen data en geen Supabase error — check service role env of RLS.");
    }
  } catch (e: any) {
    error = e;
  }

  return (
    <div className="w-full p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Leads (diagnose)</h1>

      {/* ENV sanity (zonder geheimen te tonen) */}
      <div className="text-xs text-gray-600 space-y-1 bg-gray-50 border rounded p-3">
        <div>Runtime OK</div>
        <div>SUPABASE_URL aanwezig: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "ja" : "nee"}</div>
        <div>SUPABASE_SERVICE_ROLE_KEY aanwezig: {process.env.SUPABASE_SERVICE_ROLE_KEY ? "ja" : "nee"}</div>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-medium">Fout bij minimale fetch</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {typeof error === "object" ? JSON.stringify(error, null, 2) : String(error)}
          </pre>
          <p className="text-xs text-red-700 mt-2">
            Mogelijke oorzaken: ontbrekende service-role env, RLS policy blokkeert select, table/kolomnamen afwijken.
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 border-b">Order ID</th>
                <th className="text-left px-3 py-2 border-b">Created</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{row.order_code ?? "—"}</td>
                  <td className="px-3 py-2">{row.created_at ?? "—"}</td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-gray-500">Geen rijen gevonden</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
