// app/admin/erp/labels/page.tsx

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PrintButton from "./PrintButton";
import Barcode from "./Barcode";

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
    upper.match(
      /\b(NIEUW|3\*|4\*|5\*|OEM|PREMIUM|GRADE A|GRADE B|GRADE C)\b/
    )?.[1] || "";

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

  return { model, capacity, color, grade };
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
    grade?: string;
  };
}) {
  const sku = String(searchParams?.sku || "").trim();
  const imei = String(searchParams?.imei || "").trim();
  const battery = String(searchParams?.battery || "").trim();
  const manualGrade = String(searchParams?.grade || "").trim();

  const article = await getArticleBySku(sku);
  const parsed = parseArticleTitle(article?.title || null);
  const finalGrade = manualGrade || parsed.grade;

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

          <PrintButton />
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
          </form>

          {sku && !article && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Geen artikel gevonden voor deze SKU.
            </div>
          )}

          {article && (
            <div className="mt-6 rounded-2xl border bg-green-50 p-4 text-sm text-green-800">
              <div className="font-semibold">Artikel gevonden</div>
              <div className="mt-2 text-green-900">{article.title}</div>
              <div className="mt-1">
                {article.vat_margin ? "Margin VAT" : "Normal VAT"}
              </div>
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
                  <div className="label-left">
                    <div className="label-model">{parsed.model}</div>

                    <div className="label-sub">
                      {[parsed.capacity, parsed.color]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>

                    <div className="label-lines">
                      <div className="label-row">
                        <div className="label-text">
                          <div className="label-caption">SKU</div>
                          <div className="label-value">{article.sku}</div>
                        </div>

                        <div className="label-barcode-wrap">
                          <Barcode value={article.sku} />
                        </div>
                      </div>

                      <div className="label-divider" />

                      <div className="label-row">
                        <div className="label-text">
                          <div className="label-caption">IMEI / SN</div>
                          <div className="label-value">{imei || "—"}</div>
                        </div>

                        <div className="label-barcode-wrap">
                          <Barcode value={imei} />
                        </div>
                      </div>
                    </div>

                    <div className="label-footer">
                      {article.vat_margin ? "Margin VAT" : "Normal VAT"}
                    </div>
                  </div>

                  <div className="label-right">
                    <div className="label-logo">MICROFORCE</div>

                    <div className="label-side-content">
                      <div className="label-side-block">
                        <div className="label-side-title">Grade</div>
                        <div className="label-side-value">
                          {finalGrade || "—"}
                        </div>
                      </div>

                      <div className="label-side-block">
                        <div className="label-side-title">Battery</div>
                        <div className="label-side-value">
                          {battery ? `${battery}%` : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="label-ce">CE</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-500 print:hidden">
                Label formaat: 89mm × 36mm · DYMO 99012 Large Address Label
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
          background: white;
          color: #111827;
          font-family: Arial, sans-serif;
          display: grid;
          grid-template-columns: 1fr 18mm;
          overflow: hidden;
        }

        .label-left {
          padding: 2.2mm 2.5mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .label-model {
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-sub {
          margin-top: 0.6mm;
          font-size: 8px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-lines {
          margin-top: 1.8mm;
        }

        .label-row {
          display: grid;
          grid-template-columns: 26mm 38mm;
          gap: 2mm;
          align-items: center;
        }

        .label-text {
          min-width: 0;
        }

        .label-caption {
          font-size: 5.5px;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 700;
        }

        .label-value {
          margin-top: 0.3mm;
          font-size: 8px;
          font-weight: 700;
          line-height: 1.1;
          word-break: break-all;
        }

        .label-barcode-wrap {
          overflow: hidden;
          width: 38mm;
          justify-self: start;
        }

        .label-barcode {
          width: 100%;
          height: 7mm;
          display: block;
        }

        .label-divider {
          margin: 1.3mm 0;
          border-top: 1px solid #d1d5db;
        }

        .label-footer {
          margin-top: auto;
          border-top: 1px solid #d1d5db;
          padding-top: 0.8mm;
          text-align: center;
          font-size: 6px;
          text-transform: uppercase;
          color: #475569;
          font-weight: 700;
        }

        .label-right {
          border-left: 1px solid #d1d5db;
          padding: 1.5mm;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: space-between;
        }

        .label-logo {
          border: 1px solid #111827;
          padding: 0.7mm 1mm;
          font-size: 5px;
          font-weight: 800;
          letter-spacing: 0.4px;
          text-align: center;
          width: 100%;
        }

        .label-side-content {
          display: flex;
          flex-direction: column;
          gap: 2.5mm;
        }

        .label-side-block {
          width: 100%;
          border-top: 1px solid #d1d5db;
          padding-top: 1mm;
        }

        .label-side-title {
          font-size: 5px;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 700;
        }

        .label-side-value {
          margin-top: 0.4mm;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
        }

        .label-ce {
          align-self: flex-end;
          font-size: 7px;
          font-weight: 800;
          letter-spacing: -0.4px;
          line-height: 1;
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
