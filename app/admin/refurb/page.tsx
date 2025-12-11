// app/admin/refurb/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import StatusLocationTab from "./StatusLocationTab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefurbReception = {
  id: string;
  reception_number: string;
  reception_date: string;
  supplier: string;
  vat_scheme: "margin" | "normal";
  supplier_invoice_nr: string;
  internal_invoice_nr: string | null;
};

type RefurbStatusOption = {
  id: string;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
};

type RefurbLocationOption = {
  id: string;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
};

async function getReceptions(): Promise<RefurbReception[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .select(
      "id, reception_number, reception_date, supplier, vat_scheme, supplier_invoice_nr, internal_invoice_nr"
    )
    .order("reception_date", { ascending: false });

  if (error) {
    console.error("[REFURB] error fetching receptions", error);
    return [];
  }
  return data as RefurbReception[];
}

async function getRefurbStatusOptions(): Promise<RefurbStatusOption[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_status_options")
    .select("id, value, label, is_default, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[REFURB] error fetching status options", error);
    return [];
  }
  return data as RefurbStatusOption[];
}

async function getRefurbLocationOptions(): Promise<RefurbLocationOption[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_location_options")
    .select("id, value, label, is_default, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[REFURB] error fetching location options", error);
    return [];
  }
  return data as RefurbLocationOption[];
}

export default async function RefurbListPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const activeTab =
    searchParams?.tab === "status_locations" ? "status_locations" : "receptions";

  const [receptions, statusOptions, locationOptions] = await Promise.all([
    getReceptions(),
    getRefurbStatusOptions(),
    getRefurbLocationOptions(),
  ]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Refurb receptions</h1>
        <Link
          href="/admin/refurb/new"
          className="bb-btn bb-btn-primary text-sm"
        >
          Nieuwe receptie
        </Link>
      </div>

      {/* Tabs bovenaan refurb: Recepties / Status & locations */}
      <div className="border-b mb-2">
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/refurb?tab=receptions"
            className={`px-3 py-1 border-b-2 ${
              activeTab === "receptions"
                ? "border-blue-600 text-blue-700 font-medium"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Recepties
          </Link>
          <Link
            href="/admin/refurb?tab=status_locations"
            className={`px-3 py-1 border-b-2 ${
              activeTab === "status_locations"
                ? "border-blue-600 text-blue-700 font-medium"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Status & locations
          </Link>
        </div>
      </div>

      {activeTab === "receptions" && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-2 py-1 text-left">Receptie nr</th>
              <th className="px-2 py-1 text-left">Datum</th>
              <th className="px-2 py-1 text-left">Leverancier</th>
              <th className="px-2 py-1 text-left">BTW regeling</th>
              <th className="px-2 py-1 text-left">Supplier invoice</th>
              <th className="px-2 py-1 text-left">Intern factuur nr</th>
            </tr>
          </thead>
          <tbody>
            {receptions.map((r) => (
              <tr key={r.id} className="border-b hover:bg-slate-50">
                <td className="px-2 py-1">
                  <Link
                    href={`/admin/refurb/${r.id}`}
                    className="text-blue-600 underline"
                  >
                    {r.reception_number}
                  </Link>
                </td>
                <td className="px-2 py-1">{r.reception_date}</td>
                <td className="px-2 py-1">{r.supplier}</td>
                <td className="px-2 py-1">
                  {r.vat_scheme === "margin" ? "Margin VAT" : "Normal VAT"}
                </td>
                <td className="px-2 py-1">{r.supplier_invoice_nr}</td>
                <td className="px-2 py-1">{r.internal_invoice_nr || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeTab === "status_locations" && (
        <StatusLocationTab
          initialStatuses={statusOptions}
          initialLocations={locationOptions}
        />
      )}
    </div>
  );
}
