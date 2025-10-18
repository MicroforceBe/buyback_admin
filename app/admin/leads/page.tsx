// app/admin/leads/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id: string;
  created_at: string;

  // toestel
  model: string | null;
  capacity_gb: number | null;
  variant: string | null;

  // prijzen
  base_price_cents: number | null;
  final_price_cents: number | null;
  final_price_with_voucher_cents: number | null;
  voucher_bonus_cents: number | null;
  wants_voucher: boolean | null;

  // klant
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  // levering
  delivery_method: "ship" | "dropoff" | null;
  shop_location: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  // betaling
  iban: string | null;

  // admin
  status: "new" | "in_progress" | "done" | null;
  admin_note: string | null;
  updated_at: string | null;

  // antwoorden
  answers: any;
};

function eur(cents: number | null | undefined) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}
function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("nl-BE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}
function maskIban(iban: string | null) {
  if (!iban) return "—";
  const clean = iban.replace(/\s+/g, "");
  if (clean.length <= 6) return clean;
  return clean.slice(0, 4) + "••••••••••••" + clean.slice(-4);
}

export default async function LeadsPage() {
  let data: Lead[] | null = null;
  let error: any = null;
  let count: number | null = null;

  try {
    const res = (await supabaseAdmin
      .from("buyback_leads")
      .select(
        [
          "id",
          "created_at",
          // toestel
          "model",
          "capacity_gb",
          "variant",
          // prijzen
          "base_price_cents",
          "final_price_cents",
          "final_price_with_voucher_cents",
          "voucher_bonus_cents",
          "wants_voucher",
          // klant
          "first_name",
          "last_name",
          "email",
          "phone",
          // levering
          "delivery_method",
          "shop_location",
          "street",
          "house_number",
          "postal_code",
          "city",
          "country",
          // betaling
          "iban",
          // admin
          "status",
          "admin_note",
          "updated_at",
          // antwoorden
          "answers",
        ].join(","),
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

  // ----------- FOUTKAART -----------
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-gray-500">
          Totaal: <strong>{count ?? data.length}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {data.map((lead: Lead) => (
          <article
            key={lead.id}
            className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow"
          >
            <header className="flex justify-between items-start mb-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">
                  {lead.model ?? "—"}{" "}
                  {lead.capacity_gb ? `• ${lead.capacity_gb} GB` : ""}
                  {lead.variant ? ` • ${lead.variant}` : ""}
                </h2>
                <p className="text-xs text-gray-500">{fmtDate(lead.created_at)}</p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded ${
                  lead.status === "done"
                    ? "bg-green-100 text-green-700"
                    : lead.status === "in_progress"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
                }`}
                title={`Status: ${lead.status ?? "new"}`}
              >
                {lead.status ?? "new"}
              </span>
            </header>

            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="text-gray-500">Klant:</span>{" "}
                {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
              </div>
              <div>
                <span className="text-gray-500">Contact:</span>{" "}
                {lead.email || lead.phone || "—"}
              </div>
              <div>
                <span className="text-gray-500">IBAN:</span>{" "}
                <span className="font-mono">{maskIban(lead.iban)}</span>
              </div>
              <div>
                <span className="text-gray-500">Levering:</span>{" "}
                {lead.delivery_method === "ship"
                  ? `Verzenden — ${[
                      lead.street,
                      lead.house_number,
                      lead.postal_code,
                      lead.city,
                      lead.country,
                    ]
                      .filter(Boolean)
                      .join(" ")}`
                  : lead.delivery_method === "dropoff"
                  ? `Binnenbrengen — ${lead.shop_location ?? "—"}`
                  : "—"}
              </div>
              <div className="font-semibold mt-1">
                {eur(
                  lead.final_price_with_voucher_cents ?? lead.final_price_cents ?? 0
                )}
                {lead.wants_voucher && lead.voucher_bonus_cents
                  ? `  (+${eur(lead.voucher_bonus_cents)} voucher)`
                  : ""}
              </div>
            </div>

            {lead.admin_note && (
              <p className="text-xs text-gray-500 mt-2 italic">
                Notitie: {lead.admin_note}
              </p>
            )}

            <footer className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <Link
                href={lead.email ? `mailto:${lead.email}` : "#"}
                className={`${
                  lead.email ? "text-blue-600 hover:underline" : "pointer-events-none opacity-50"
                }`}
              >
                Contacteer klant
              </Link>
              <span className="text-[11px]">ID: {lead.id.slice(0, 8)}…</span>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
