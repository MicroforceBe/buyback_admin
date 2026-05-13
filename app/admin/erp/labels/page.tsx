// app/admin/erp/labels/page.tsx

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Article = {
  sku: string;
  title: string | null;
  price_cents: number | null;
  vat_margin: boolean | null;
};

function parseArticleTitle(title: string | null) {
  const raw = title || "";
  const upper = raw.toUpperCase();

  const capacity =
    upper.match(/\b(64GB|128GB|256GB|512GB|1TB|2TB)\b/)?.[1] || "";

  const grade =
    upper.match(/\b(3\*|4\*|5\*|OEM|PREMIUM|GRADE A|GRADE B|GRADE C)\b/)?.[1] ||
    "";

  const colors = [
    "BLACK",
    "WHITE",
    "BLUE",
    "RED",
    "GREEN",
    "YELLOW",
    "PURPLE",
    "PINK",
    "SILVER",
    "GOLD",
    "GRAPHITE",
    "MIDNIGHT",
    "STARLIGHT",
    "SPACE GRAY",
    "SPACE BLACK",
    "TITANIUM",
    "NATURAL",
  ];

  const color = colors.find((c) => upper.includes(c)) || "";

  const modelMatch = upper.match(
    /(IPHONE\s+[0-9A-Z]+\s*(MINI|PRO MAX|PRO|PLUS|MAX)?|IPAD\s+[A-Z0-9\s]+|MACBOOK\s+[A-Z0-9\s]+)/
  );

  const model = modelMatch?.[1]?.trim() || raw;

  return {
    model,
    capacity,
    color,
    grade,
  };
}

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
  searchParams,
}: {
  searchParams?: {
    sku?: string;
    imei?: string;
    battery?: string;
  };
}) {
  const sku = String(searchParams?.sku || "").trim();
  const imei = String(searchParams?.imei || "").trim();
  const battery = String(searchParams?.battery || "").trim();

  const article = await getArticleBySku(sku);
  const parsed = parseArticleTitle(article?.title || null);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white print:hidden">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            ERP Labels
          </div>

          <h1 className="mt-3 text-3xl font-bold">Productlabels printen</h1>

          <p className="mt-3 text-sm text-slate-300">
            Geef een SKU in, haal automatisch de ERP-omschrijving op en print
            een label met model, kleur, capaciteit, grade en IMEI/SN.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr] print:block">
        <div className="rounded-2xl border bg-white p-6 shadow-sm print:hidden">
          <form className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                SKU
              </label>

              <input
                name="sku"
                defaultValue={sku}
                placeholder="Bijv. 211000040644"
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
                placeholder="IMEI of serienummer"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Batterij %
              </label>

              <input
                name="battery"
                defaultValue={battery}
                placeholder="Bijv. 89"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Label tonen
            </button>
          </form>

          {sku && !article && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Geen artikel gevonden voor deze SKU.
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
          {article ? (
            <>
              <div className="mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Label preview
                  </div>

                  <div className="text-xs text-slate-500">
                    {article.title}
                  </div>
                </div>

            <PrintButton />
                
              </div>

              <div className="label-sheet">
                <div className="label-card">
                  <div>
                    <div className="label-model">
                      {parsed.model}
                    </div>

                    <div className="label-sub">
                      {[parsed.capacity, parsed.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>

                    <div className="label-grid">
                      <div>
                        <span>SKU</span>
                        <b>{article.sku}</b>
                      </div>

                      <div>
                        <span>Grade</span>
                        <b>{parsed.grade || "—"}</b>
                      </div>

                      <div>
                        <span>IMEI/SN</span>
                        <b>{imei || "—"}</b>
                      </div>

                      <div>
                        <span>Battery</span>
                        <b>{battery ? `${battery}%` : "—"}</b>
                      </div>
                    </div>

                    <div className="label-footer">
                      {article.vat_margin
                        ? "Margin VAT"
                        : "Normal VAT"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">
              Geef een SKU in om een label te genereren.
            </div>
          )}
        </div>
      </div>

      <style>{`
        .label-sheet {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
        }

        .label-card {
          width: 89mm;
          height: 36mm;
          border: 1px solid #111827;
          padding: 3mm 4mm;
          background: white;
          color: #111827;
          font-family: Arial, sans-serif;

          display: grid;
          grid-template-columns: 1fr auto;
          gap: 3mm;

          overflow: hidden;
        }

        .label-model {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.05;
          text-transform: uppercase;
        }

        .label-sub {
          margin-top: 1mm;
          font-size: 10px;
          font-weight: 600;
        }

        .label-grid {
          margin-top: 2mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5mm;
          font-size: 8px;
        }

        .label-grid span {
          display: block;
          color: #64748b;
          font-size: 7px;
          text-transform: uppercase;
        }

        .label-grid b {
          display: block;
          font-size: 9px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .label-footer {
          margin-top: 2mm;
          border-top: 1px solid #e5e7eb;
          padding-top: 1mm;
          font-size: 7px;
          text-transform: uppercase;
          color: #64748b;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .label-sheet,
          .label-sheet * {
            visibility: visible;
          }

          .label-sheet {
            position: fixed;
            left: 0;
            top: 0;
          }

          @page {
            size: 89mm 36mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
