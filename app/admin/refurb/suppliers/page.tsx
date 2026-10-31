import LocalDate from '@/app/admin/LocalDate';
import ui from '../rma/rma.module.css';
import styles from '../reception.module.css';
import { updateSupplierRmaDays } from '../receptionMetadataActions';
import { requirePageAccess } from '@/lib/security/access';
// app/admin/refurb/suppliers/page.tsx
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { createRefurbSupplierFromForm } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SupplierRow = {
  id: string;
  name: string;
  vat_number: string | null;
  contact_email: string | null;
  created_at: string;
  rma_expiry_days:number;
};

async function getSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_suppliers")
    .select("id, name, vat_number, contact_email, created_at, rma_expiry_days")
    .order("name", { ascending: true });

  if (error) {
    console.error("[REFURB] getSuppliers error", error);
    return [];
  }

  return data as SupplierRow[];
}

export default async function RefurbSuppliersPage({searchParams}:{searchParams?:Promise<{meta?:string}>}) {
  await requirePageAccess('refurb', true);

  const user = await getCurrentAdminUser();

  if (!user) {
    redirect("/admin/login?reason=not_logged_in");
  }

  // Alleen admins mogen leveranciers beheren
  if (user.role !== "admin") {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-base font-semibold">Leveranciers</h2>
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
          <div className="text-red-700 font-medium mb-1">Geen toegang</div>
          <p className="text-xs text-red-700">
            Enkel admin gebruikers mogen leveranciers bekijken en beheren.
          </p>
        </div>
      </div>
    );
  }

  const suppliers = await getSuppliers();
  const query=await searchParams;

  return (
    <div className={`${ui.workspace} ${styles.reception}`}>
      <header className="rma-hero"><div><div className="rma-kicker">Refurb / instellingen</div><h1>Leveranciers</h1><p>Beheer contacten en de standaard RMA-termijn voor nieuwe recepties.</p></div><span className="rma-badge">{suppliers.length} leveranciers</span></header>
      {query?.meta&&<p role={query.meta==='saved'?'status':'alert'}>{query.meta==='saved'?'RMA-termijn opgeslagen. Deze geldt voor nieuwe recepties.':query.meta==='conflict'?'De termijn is intussen gewijzigd. Vernieuw de pagina.':'Niet opgeslagen. Vul een geheel aantal dagen in (0–36500).'}</p>}
      {/* Nieuwe leverancier formulier */}
      <div className="rma-section">
        <h2 className="text-sm font-semibold mb-2">Nieuwe leverancier</h2>
        <form action={createRefurbSupplierFromForm} className="reception-new-grid">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="name"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              Naam
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="bb-input h-8 text-xs px-2"
              placeholder="Naam leverancier"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="vat_number"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              BTW-nummer
            </label>
            <input
              id="vat_number"
              name="vat_number"
              type="text"
              className="bb-input h-8 text-xs px-2"
              placeholder="BE0..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="contact_email"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              E-mail
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              className="bb-input h-8 text-xs px-2"
              placeholder="contact@leverancier.be"
            />
          </div>

          <label className="flex flex-col gap-1 text-xs">RMA Expire Date (dagen)<input type="number" name="rma_expiry_days" defaultValue={30} min={0} max={36500} step={1} required className="bb-input"/></label>
          <div className="flex justify-end mt-1">
            <button
              type="submit"
              className="bb-btn bb-btn-primary h-8 px-4 text-xs"
            >
              Opslaan
            </button>
          </div>
        </form>
      </div>

      {/* Overzicht bestaande leveranciers */}
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
              <th className="px-3 py-2 border-b text-left">RMA Expire Date (dagen)</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-3 text-xs text-slate-500 text-center"
                >
                  Nog geen leveranciers gevonden. Voeg de eerste leverancier toe
                  via het formulier hierboven.
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
                    ? <LocalDate value={s.created_at}/>
                    : "—"}
                </td>
                <td className="px-3 py-2"><form action={updateSupplierRmaDays} className="reception-inline-meta"><input type="hidden" name="supplier_id" value={s.id}/><input type="hidden" name="original_days" value={s.rma_expiry_days}/><input name="rma_expiry_days" aria-label={'RMA-termijn '+s.name} type="number" min={0} max={36500} step={1} required defaultValue={s.rma_expiry_days}/><button className="bb-btn">Opslaan</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


