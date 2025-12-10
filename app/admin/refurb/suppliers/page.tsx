// app/admin/refurb/suppliers/page.tsx
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SupplierRow = {
  id: string;
  name: string;
  vat_number: string | null;
  contact_email: string | null;
  created_at: string;
};

async function getSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_suppliers")
    .select("id, name, vat_number, contact_email, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("[REFURB] getSuppliers error", error);
    return [];
  }

  return data as SupplierRow[];
}

export default async function RefurbSuppliersPage() {
  const user = await getCurrentAdminUser();

  if (!user) {
    redirect("/admin/login?reason=not_logged_in");
  }

  // Alleen admins mogen leveranciers beheren
  if (user.role !== "admin") {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">Refurb leveranciers</h1>
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
          <div className="text-red-700 font-medium mb-1">
            Geen toegang
          </div>
          <p className="text-xs text-red-700">
            Enkel admin gebruikers mogen leveranciers bekijken en beheren.
          </p>
        </div>
      </div>
    );
  }

  const suppliers = await getSuppliers();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Refurb leveranciers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Overzicht van alle leveranciers die je kunt koppelen aan Refurb receptions.
          </p>
        </div>
      </div>

      <div className="border rounded-md bg-white overflow-hidden text-sm">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 border-b text-left">Naam</th>
              <th className="px-3 py-2 border-b text-left">BTW-nummer</th>
              <th className="px-3 py-2 border-b text-left">E-mail</th>
              <th className="px-3 py-2 border-b text-left whitespace-nowrap">
                Aangemaakt op
              </th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-3 text-xs text-slate-500 text-center"
                >
                  Nog geen leveranciers gevonden. Je kunt een leverancier
                  aanmaken via de knop{" "}
                  <span className="font-medium">“Nieuwe leverancier”</span> in
                  het receptie-formulier.
                </td>
              </tr>
            )}

            {suppliers.map((s) => (
              <tr key={s.id} className="border-t hover:bg-slate-50/60">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-sm">{s.name}</div>
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-700">
                  {s.vat_number || <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 align-top text-xs text-sky-700">
                  {s.contact_email ? (
                    <a
                      href={`mailto:${s.contact_email}`}
                      className="underline"
                    >
                      {s.contact_email}
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap">
                  {s.created_at
                    ? new Date(s.created_at).toLocaleDateString("nl-BE")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
