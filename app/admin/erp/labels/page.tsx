import { requirePageAccess } from '@/lib/security/access';
// app/admin/erp/labels/page.tsx

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PrintButton from "./PrintButton";
import { receptionBatteryLabelIssue } from '@/lib/receptionBattery';
import { labelStyles, renderProductLabel } from "@/lib/productLabel";
import { getRefurbLabelSource } from "./refurbSource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Article = {
  sku: string;
  title: string | null;
  price_cents: number | null;
  vat_margin: boolean | null;
};

async function getArticleBySku(sku: string): Promise<Article | null> {
  if (!sku.trim()) return null;

  const { data, error } = await supabaseAdmin
    .from("erp_articles")
    .select("sku, title, price_cents, vat_margin")
    .eq("sku", sku.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ERP LABELS] article lookup error", error);
    return null;
  }

  return data as Article | null;
}

export default async function ErpLabelsPage({
  searchParams: incomingSearchParams,
}: {
  searchParams?: Promise<{
    item?: string;
    sku?: string;
    imei?: string;
    battery?: string;
    grade?: string;
  }>;
}) {
  const searchParams = await incomingSearchParams;
  const fromRefurb = searchParams?.item !== undefined;
  const source = fromRefurb ? await getRefurbLabelSource(String(searchParams?.item ?? '')) : null;
  if (!fromRefurb) await requirePageAccess('erp', false);
  const sourceError = source && 'error' in source ? source.error : null;

  const sku = fromRefurb ? (source?.sku ?? "") : String(searchParams?.sku || "").trim();
  const imei = fromRefurb ? (source?.imei ?? "") : String(searchParams?.imei || "").trim();
  const battery = fromRefurb ? (source?.battery ?? "") : String(searchParams?.battery || "").trim();
  const manualGrade = fromRefurb ? "" : String(searchParams?.grade || "").trim();

  const article = await getArticleBySku(sku);
  let labelHtml: string | null = null;
  let labelError = '';
  if (article) {
    try {
      if (fromRefurb) { const issue = receptionBatteryLabelIssue(battery, article.title, source?.description); if (issue) throw new Error(issue); }
      labelHtml = renderProductLabel({sku:article.sku,title:article.title,serial:imei,battery,grade:manualGrade,omitEmptyBattery:fromRefurb,vatMargin:article.vat_margin}); }
    catch(error){ labelError = error instanceof Error ? error.message : 'Het label kon niet worden opgebouwd.'; }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">
              ERP Labels
            </div>

            <h1 className="mt-3 text-3xl font-bold">
              Productlabels printen
            </h1>

            <p className="mt-3 text-sm text-slate-300">
              DYMO LabelWriter 450 · 99012 · 89mm × 36mm
            </p>
          </div>

          <PrintButton html={labelHtml} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr] print:block">
        <div className="rounded-2xl border bg-white p-6 shadow-sm print:hidden">
          {fromRefurb ? <div className="space-y-3 text-sm"><h2 className="font-semibold">Label van receptieartikel</h2>{sourceError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{sourceError}</p> : <><p>SKU en IMEI / serienummer zijn overgenomen uit het opgeslagen artikel. Graad komt uit de ERP-omschrijving indien beschikbaar.</p><p>Controleer de labelpreview vóór het printen.</p>{source?.item && <a className="text-sky-700 underline" href={`/admin/refurb/${source.item.reception_id}#reception-items`}>Terug naar receptie</a>}</>}</div> : <form className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                SKU
              </label>

              <input
                name="sku"
                defaultValue={sku}
                placeholder="211000040644"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                IMEI / SN
              </label>

              <input
                name="imei"
                defaultValue={imei}
                placeholder="356732085604816"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Battery %
              </label>

              <input
                name="battery"
                defaultValue={battery}
                placeholder="89"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Grade
              </label>

              <select
                name="grade"
                defaultValue={manualGrade}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">Automatically from description</option>
                <option value="Nieuw">Nieuw</option>
                <option value="3*">3*</option>
                <option value="4*">4*</option>
                <option value="5*">5*</option>
                <option value="OEM">OEM</option>
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              Label tonen
            </button>
          </form>}

          {sku && !article && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Geen artikel gevonden voor deze SKU.
            </div>
          )}

          {article && (
            <div className="mt-6 rounded-2xl border bg-green-50 p-4 text-sm text-green-800">
              <div className="font-semibold">Artikel gevonden</div>
              <div className="mt-2 text-green-900">{article?.title}</div>
              <div className="mt-1">
                {article.vat_margin ? "Margin VAT" : "Normal VAT"}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
          {labelHtml ? (
            <>
              <div className="mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Label preview
                  </div>

                  <div className="text-xs text-slate-500">
                    {article?.title}
                  </div>
                </div>

                <PrintButton html={labelHtml} />
              </div>

              <div className="overflow-auto" dangerouslySetInnerHTML={{__html:labelHtml ?? ''}} />

              <div className="mt-4 text-xs text-slate-500 print:hidden">
                DYMO LabelWriter 450 · 99012 (89 × 36 mm). Kies dit papierformaat, schaal 100%, marges 0 en geen kop-/voetteksten. Controleer dat het afdrukvoorbeeld één label toont.
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">
              {labelError || sourceError || (sku && !article ? "Geen ERP-artikel gevonden voor deze SKU." : "Geef een SKU in om een label te genereren.")}
            </div>
          )}
        </div>
      </div>

      <style>{labelStyles}</style>
    </div>
  );
}




