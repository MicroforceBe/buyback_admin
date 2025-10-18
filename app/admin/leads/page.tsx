// app/admin/leads/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  created_at: string;
  brand: string | null;
  model: string | null;
  variant: string | null;
  capacity_gb: number | null;
  final_price_cents: number | null;
  wants_voucher: boolean | null;
  status: string | null;
  method: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  housenr: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;
  admin_note: string | null;
};

export default async function LeadsPage() {
  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;

  try {
    const res = (await supabaseAdmin
      .from("buyback_leads")
      .select(
        `
        id, created_at, brand, model, variant, capacity_gb,
        final_price_cents, wants_voucher, status, method,
        first_name, last_name, email, phone,
        street, housenr, zip, city, country, iban,
        admin_note
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })) as unknown as {
      data: Lead[] | null;
      error: any;
      count: number | null;
    };

    data = res.data;
    error = res.error;
    count = res.count;
  } catch (e: any) {
    error = e;
  }

  // ----------- Foutkaart tonen i.p.v. crashen -----------
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-3">Leads</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <div className="font-medium text-red-700">Fout bij laden</div>
          <pre className="text-xs mt-2 text-red-800 whitespace-pre-wrap break-words">
            {error?.message || JSON.stringify(error)}
          </pre>
        </div>
      </div>
    );
  }

  // Geen data
  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-3">Leads</h1>
        <p className="text-gray-600">Geen aanvragen gevonden.</p>
      </div>
    );
  }

  // ----------- UI -----------
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-3">Leads</h1>
      <p className="text-sm text-gray-500 mb-6">
        Totaal: <strong>{count ?? data.length}</strong> aanvragen
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {data.map((lead: Lead) => (
          <article
            key={lead.id}
            className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow"
          >
            <header className="flex justify-between items-start mb-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">
                  {lead.brand} {lead.model}{" "}
                  {lead.capacity_gb ? `${lead.capacity_gb}GB` : ""}
                </h2>
                <p className="text-xs text-gray-500">
                  {new Date(lead.created_at).toLocaleString("nl-BE")}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded ${
                  lead.status === "done"
                    ? "bg-green-100 text-green-700"
                    : lead.status === "in_progress"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {lead.status || "new"}
              </span>
            </header>

            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="text-gray-500">Naam:</span>{" "}
                {lead.first_name} {lead.last_name}
              </div>
              <div>
                <span className="text-gray-500">E-mail:</span>{" "}
                {lead.email || "-"}
              </div>
              <div>
                <span className="text-gray-500">IBAN:</span>{" "}
                {lead.iban || "-"}
              </div>
              <div>
                <span className="text-gray-500">Methode:</span>{" "}
                {lead.method || "-"}
              </div>
              <div>
                <span className="text-gray-500">Voucher:</span>{" "}
                {lead.wants_voucher ? "Ja" : "Nee"}
              </div>
              <div className="font-semibold mt-1">
                € {(lead.final_price_cents ?? 0) / 100}
              </div>
            </div>

            {lead.admin_note && (
              <p className="text-xs text-gray-500 mt-2 italic">
                Notitie: {lead.admin_note}
              </p>
            )}

            <footer className="mt-3">
              <Link
                href={`mailto:${lead.email ?? ""}`}
                className="text-xs text-blue-600 hover:underline"
              >
                Contacteer klant
              </Link>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
