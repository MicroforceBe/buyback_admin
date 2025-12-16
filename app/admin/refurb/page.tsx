// app/admin/refurb/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

// ✅ Volledige receptie verwijderen (alleen admin) — enkel gebruikt in overview
async function deleteRefurbReceptionAction(formData: FormData) {
  "use server";

  const user = await getCurrentAdminUser();
  if (!user || (user as any).role !== "admin") {
    redirect("/admin/refurb?msg=forbidden:not_admin");
  }

  const receptionId = String(formData.get("reception_id") || "").trim();
  if (!receptionId) {
    redirect("/admin/refurb?msg=missing_reception_id");
  }

  // 1) eerst items verwijderen (FK-safe)
  const { error: delItemsErr } = await supabaseAdmin
    .from("refurb_reception_items")
    .delete()
    .eq("reception_id", receptionId);

  if (delItemsErr) {
    console.error("[REFURB] delete reception items error", delItemsErr);
    redirect(`/admin/refurb?msg=delete_items_error:${encodeURIComponent(delItemsErr.message)}`);
  }

  // 2) dan de receptie zelf
  const { error: delRecErr } = await supabaseAdmin
    .from("refurb_receptions")
    .delete()
    .eq("id", receptionId);

  if (delRecErr) {
    console.error("[REFURB] delete reception error", delRecErr);
    redirect(`/admin/refurb?msg=delete_reception_error:${encodeURIComponent(delRecErr.message)}`);
  }

  revalidatePath("/admin/refurb");
  redirect("/admin/refurb?msg=deleted_reception");
}

export default async function RefurbListPage() {
  const receptions = await getReceptions();
  const user = await getCurrentAdminUser();
  const isAdmin = !!user && (user as any).role === "admin";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Refurb receptions</h1>
        <Link href="/admin/refurb/new" className="bb-btn bb-btn-primary text-sm">
          Nieuwe receptie
        </Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2 py-1 text-left">Receptie nr</th>
            <th className="px-2 py-1 text-left">Datum</th>
            <th className="px-2 py-1 text-left">Leverancier</th>
            <th className="px-2 py-1 text-left">BTW regeling</th>
            <th className="px-2 py-1 text-left">Supplier invoice</th>
            <th className="px-2 py-1 text-left">Intern factuur nr</th>
            {isAdmin && <th className="px-2 py-1 text-left">Acties</th>}
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

              {isAdmin && (
                <td className="px-2 py-1">
                  {/* ✅ Confirm “dialog” zonder client-JS: 2-staps confirm via <details> */}
                  <details className="inline-block">
                    <summary className="cursor-pointer text-red-600 hover:underline select-none">
                      Verwijderen
                    </summary>

                    <div className="mt-2 p-2 border rounded-md bg-white text-xs space-y-2">
                      <div className="text-slate-700">
                        Ben je zeker dat je receptie{" "}
                        <span className="font-semibold">{r.reception_number}</span>{" "}
                        definitief wil verwijderen?
                        <div className="text-[11px] text-slate-500">
                          (Dit verwijdert ook alle rijen/items.)
                        </div>
                      </div>

                      <form action={deleteRefurbReceptionAction} className="flex items-center gap-2">
                        <input type="hidden" name="reception_id" value={r.id} />
                        <button type="submit" className="bb-btn text-[11px] px-2 h-7">
                          Ja, definitief verwijderen
                        </button>
                      </form>
                    </div>
                  </details>
                </td>
              )}
            </tr>
          ))}

          {receptions.length === 0 && (
            <tr>
              <td className="px-2 py-4 text-slate-500" colSpan={isAdmin ? 7 : 6}>
                Geen recepties gevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
