// app/admin/erp/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const modules = [
  {
    title: "Artikel database",
    description:
      "Beheer alle ERP-artikelen, SKU’s, EAN-codes, modellen, capaciteit, kleur en artikelstatus.",
    href: "/admin/erp/articles",
    emoji: "🏷️",
    status: "Basis",
  },
  {
    title: "ERP sync",
    description:
      "Synchroniseer artikels vanuit het ERP en controleer nieuwe, gewijzigde of ontbrekende SKU’s.",
    href: "/admin/erp/sync",
    emoji: "🔄",
    status: "Gepland",
  },
  {
    title: "SKU koppelingen",
    description:
      "Koppel ERP SKU’s automatisch of handmatig aan refurb toestellen en buyback leads.",
    href: "/admin/erp/matching",
    emoji: "🔗",
    status: "Gepland",
  },
  {
    title: "Labels printen",
    description:
      "Print productlabels met SKU, barcode, IMEI/SN, model, conditie en batterijstatus.",
    href: "/admin/erp/labels",
    emoji: "🖨️",
    status: "Gepland",
  },
  {
  title: "FTP instellingen",
  description:
    "Configureer de FTP locatie, bestandsnaam en login waarmee ERP artikels worden opgehaald.",
  href: "/admin/erp/settings",
  emoji: "🔐",
  status: "Actief",
},
];

export default function ErpPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ERP beheer
            </div>

            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              ERP artikel- en SKU database
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Centrale plaats om ERP-artikelen te synchroniseren, SKU’s te
              beheren, refurb toestellen en buyback leads te koppelen en labels
              te printen.
            </p>
          </div>

          <div className="hidden rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white md:block">
            ERP
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-3xl">{module.emoji}</div>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                {module.status}
              </span>
            </div>

            <h2 className="mt-4 text-base font-semibold text-slate-900 group-hover:text-sky-700">
              {module.title}
            </h2>

            <p className="mt-2 text-sm leading-5 text-slate-600">
              {module.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">
            Doel van deze ERP module
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">
                Centrale SKU master
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Eén betrouwbare bron voor SKU’s, modelinformatie, barcodes en
                labeldata.
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">
                Refurb koppeling
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Refurb toestellen automatisch koppelen aan het juiste ERP
                artikel op basis van SKU.
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">
                Lead koppeling
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Buyback leads verrijken met artikeldata zodat verwerking en
                labelprinting sneller verlopen.
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">
                Label output
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Labels genereren met SKU, barcode, IMEI/SN, model,
                batterijstatus en conditie.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Volgende stappen
          </h2>

          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                1
              </span>
              ERP artikel tabel aanmaken
            </li>

            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                2
              </span>
              Artikel import/sync voorzien
            </li>

            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                3
              </span>
              SKU matching met refurb en leads
            </li>

            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                4
              </span>
              Label printing flow bouwen
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
