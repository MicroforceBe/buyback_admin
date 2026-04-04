"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type HelpSection = {
  id: string;
  title: string;
  summary?: string;
  searchText: string;
  content: React.ReactNode;
};

function SectionCard({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6 shadow-sm scroll-mt-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">
            {title}
          </h2>
          {summary ? (
            <p className="text-sm text-gray-500 mt-1">{summary}</p>
          ) : null}
        </div>

        <a
          href="#top"
          className="text-xs text-gray-500 hover:text-gray-900 underline whitespace-nowrap"
        >
          Naar boven
        </a>
      </div>

      <div className="mt-4 space-y-4 text-sm leading-6 text-gray-700">
        {children}
      </div>
    </section>
  );
}

function InfoBox({
  title,
  tone = "blue",
  children,
}: {
  title: string;
  tone?: "blue" | "green" | "yellow" | "red" | "gray";
  children: React.ReactNode;
}) {
  const tones = {
    blue: "bg-sky-50 border-sky-200 text-sky-900",
    green: "bg-green-50 border-green-200 text-green-900",
    yellow: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-red-50 border-red-200 text-red-900",
    gray: "bg-gray-50 border-gray-200 text-gray-900",
  };

  return (
    <div className={`border rounded-xl p-4 ${tones[tone]}`}>
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm leading-6">{children}</div>
    </div>
  );
}

function FlowRow({
  items,
}: {
  items: { label: string; tone?: "gray" | "blue" | "green" | "red" | "yellow" }[];
}) {
  const toneMap = {
    gray: "bg-gray-100 border-gray-200 text-gray-800",
    blue: "bg-sky-100 border-sky-200 text-sky-800",
    green: "bg-green-100 border-green-200 text-green-800",
    red: "bg-red-100 border-red-200 text-red-800",
    yellow: "bg-amber-100 border-amber-200 text-amber-800",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, idx) => (
        <div key={`${item.label}-${idx}`} className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-medium ${
              toneMap[item.tone ?? "gray"]
            }`}
          >
            {item.label}
          </span>
          {idx < items.length - 1 ? (
            <span className="text-gray-400 text-sm">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const sections: HelpSection[] = [
  {
    id: "overzicht",
    title: "Overzicht",
    summary: "Wat je met de Leads-module kan doen.",
    searchText:
      "overzicht leads module buyback aanvragen opvolgen klantgegevens toestelgegevens prijs status historiek",
    content: (
      <>
        <p>
          De pagina <strong>Leads</strong> is het centrale werkoverzicht voor alle
          buyback-aanvragen. Hier volg je aanvragen op van nieuw dossier tot
          afgewerkt of geannuleerd.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Waarvoor gebruik je deze pagina?" tone="blue">
            Aanvragen opvolgen, klant- en toestelgegevens aanvullen, prijzen
            aanpassen, statussen wijzigen en historiek raadplegen.
          </InfoBox>

          <InfoBox title="Voor wie is deze pagina bedoeld?" tone="green">
            Voor medewerkers die dagelijks buyback-dossiers verwerken en willen
            weten wat de volgende correcte stap is.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "opbouw",
    title: "Opbouw van de pagina",
    summary: "Wat elke kolom op de Leads-pagina betekent.",
    searchText:
      "opbouw pagina kolommen order id datum klant model prijs status tabel uitklappen details",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Order ID" tone="gray">
            Toont het ordernummer en extra details via het uitklapblok, zoals
            statuslog, levermethode, betaalmethode en annulatie-info.
          </InfoBox>

          <InfoBox title="Datum" tone="gray">
            De datum waarop de lead werd aangemaakt.
          </InfoBox>

          <InfoBox title="Klant" tone="gray">
            Klantnummer, naam, adres, e-mail, telefoon en IBAN.
          </InfoBox>

          <InfoBox title="Model" tone="gray">
            Toestelgegevens zoals model, variant, opslag, SKU, IMEI/SN,
            batterijpercentage en gebruikte onderdelen.
          </InfoBox>

          <InfoBox title="Prijs (€)" tone="gray">
            De huidige prijs van de lead. In veel gevallen kan die inline
            aangepast worden.
          </InfoBox>

          <InfoBox title="Status" tone="gray">
            De huidige status en de geldige vervolgstatussen voor deze lead.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "filters",
    title: "Zoeken, filteren en sorteren",
    summary: "Zo vind je snel de juiste lead terug.",
    searchText:
      "zoeken filteren sorteren zoekterm datum order klant model gb status methode prijs stad winkel voucher chips reset",
    content: (
      <>
        <p>Je kan filteren op onder meer:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            "Zoekterm",
            "Datum",
            "Order ID",
            "Klant",
            "Model",
            "GB",
            "Status",
            "Methode",
            "Prijs",
            "Stad",
            "Winkel",
            "Voucher",
          ].map((x) => (
            <div
              key={x}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
            >
              {x}
            </div>
          ))}
        </div>

        <InfoBox title="Tip" tone="yellow">
          Actieve filters worden bovenaan ook als chips weergegeven. Je kan ze
          daar individueel verwijderen of alles resetten.
        </InfoBox>
      </>
    ),
  },
  {
    id: "levermethodes",
    title: "Levermethodes",
    summary: "Elke lead volgt een flow op basis van verzenden of binnenbrengen.",
    searchText:
      "levermethodes verzenden binnenbrengen ship dropoff flow methode label winkel pakket",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Verzenden" tone="blue">
            De klant stuurt het toestel op met een verzendlabel.
          </InfoBox>

          <InfoBox title="Binnenbrengen" tone="green">
            De klant brengt het toestel binnen in een gekozen winkel.
          </InfoBox>
        </div>

        <p>
          De beschikbare vervolgstatussen hangen af van deze levermethode.
        </p>
      </>
    ),
  },
  {
    id: "flow-dropoff",
    title: "Flow voor binnenbrengen",
    summary: "Typische stappen voor leads met levermethode binnenbrengen.",
    searchText:
      "flow binnenbrengen dropoff reminder ontvangen in de winkel controle succesvol gefaald afgewerkt geannuleerd",
    content: (
      <>
        <FlowRow
          items={[
            { label: "Nieuw", tone: "gray" },
            { label: "Reminder 1 Binnenbrengen", tone: "yellow" },
            { label: "Reminder 2 Binnenbrengen", tone: "yellow" },
            { label: "Reminder 3 Binnenbrengen", tone: "yellow" },
            { label: "Ontvangen in de winkel", tone: "blue" },
            { label: "Controle succesvol of gefaald", tone: "green" },
            { label: "Afgewerkt / Geannuleerd", tone: "red" },
          ]}
        />

        <InfoBox title="Belangrijk" tone="green">
          Ook na reminder 1, 2 of 3 kan de lead nog altijd naar{" "}
          <strong>Ontvangen in de winkel</strong> gezet worden zodra de klant
          effectief binnenkomt.
        </InfoBox>
      </>
    ),
  },
  {
    id: "flow-ship",
    title: "Flow voor verzending",
    summary: "Typische stappen voor leads met levermethode verzenden.",
    searchText:
      "flow verzending ship verzendlabel reminder opzenden zending ontvangen controle succesvol gefaald afgewerkt geannuleerd",
    content: (
      <>
        <FlowRow
          items={[
            { label: "Nieuw", tone: "gray" },
            { label: "Verzendlabel aangemaakt", tone: "blue" },
            { label: "Reminder 1 Opzenden", tone: "yellow" },
            { label: "Reminder 2 Opzenden", tone: "yellow" },
            { label: "Reminder 3 Opzenden", tone: "yellow" },
            { label: "Zending ontvangen", tone: "blue" },
            { label: "Controle succesvol of gefaald", tone: "green" },
            { label: "Afgewerkt / Geannuleerd", tone: "red" },
          ]}
        />

        <InfoBox title="Belangrijk" tone="green">
          Ook na reminder 1, 2 of 3 kan de lead nog altijd naar{" "}
          <strong>Zending ontvangen</strong> gezet worden zodra het pakket
          effectief binnenkomt.
        </InfoBox>
      </>
    ),
  },
  {
    id: "statussen",
    title: "Betekenis van de statussen",
    summary: "Wat elke status in de praktijk betekent.",
    searchText:
      "betekenis statussen nieuw verzendlabel reminder binnenbrengen ontvangen winkel reminder opzenden zending ontvangen controle succesvol check failed technisch grading afgewerkt geannuleerd",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Nieuw" tone="gray">
            De aanvraag is aangemaakt maar nog niet verder verwerkt.
          </InfoBox>
          <InfoBox title="Verzendlabel aangemaakt" tone="blue">
            Er werd een label aangemaakt voor een verzenddossier.
          </InfoBox>
          <InfoBox title="Reminder 1 / 2 / 3 Binnenbrengen" tone="yellow">
            Herinneringsstatussen voor klanten die nog niet in de winkel zijn
            geweest.
          </InfoBox>
          <InfoBox title="Ontvangen in de winkel" tone="blue">
            Het toestel werd effectief binnengebracht.
          </InfoBox>
          <InfoBox title="Reminder 1 / 2 / 3 Opzenden" tone="yellow">
            Herinneringsstatussen voor klanten die nog niet hebben opgestuurd.
          </InfoBox>
          <InfoBox title="Zending ontvangen" tone="blue">
            Het pakket is effectief ontvangen.
          </InfoBox>
          <InfoBox title="Controle succesvol" tone="green">
            Het toestel is goedgekeurd.
          </InfoBox>
          <InfoBox title="Controle gefaald, technisch defect" tone="red">
            Er is een technisch probleem vastgesteld.
          </InfoBox>
          <InfoBox title="Controle gefaald, gradering" tone="red">
            De werkelijke staat of gradering wijkt af van wat opgegeven werd.
          </InfoBox>
          <InfoBox title="Afgewerkt" tone="green">
            De aanvraag is volledig afgehandeld.
          </InfoBox>
          <InfoBox title="Geannuleerd" tone="red">
            De aanvraag werd stopgezet. Een annulatie heeft altijd een reden.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "regels",
    title: "Regels voor statusovergangen",
    summary: "Waarom sommige opties wel of niet zichtbaar zijn.",
    searchText:
      "regels statusovergangen klantnummer nieuw geannuleerd imei sn sku batterijpercentage gebruikte onderdelen check passed check failed eindstatus",
    content: (
      <>
        <InfoBox title="Belangrijkste regels" tone="blue">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Vanuit <strong>Nieuw</strong> kan je alleen verder als het{" "}
              <strong>klantnummer ingevuld</strong> is, behalve naar{" "}
              <strong>Geannuleerd</strong>.
            </li>
            <li>
              Voor <strong>Controle gefaald</strong>-statussen moet{" "}
              <strong>IMEI/SN</strong> ingevuld zijn.
            </li>
            <li>
              Voor <strong>Controle succesvol</strong> moeten klantnummer, SKU,
              IMEI/SN, batterijpercentage en gebruikte onderdelen ingevuld zijn.
            </li>
            <li>
              <strong>Afgewerkt</strong> kan alleen na{" "}
              <strong>Controle succesvol</strong>.
            </li>
            <li>
              <strong>Afgewerkt</strong> en <strong>Geannuleerd</strong> zijn
              eindstatussen.
            </li>
          </ul>
        </InfoBox>
      </>
    ),
  },
  {
    id: "gegevens",
    title: "Klant- en toestelgegevens bewerken",
    summary: "Welke velden je nog kan aanpassen tijdens de verwerking.",
    searchText:
      "klantgegevens toestelgegevens bewerken klantnummer naam adres telefoon email iban model variant opslag sku imei batterij gebruikte onderdelen",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Klantgegevens" tone="gray">
            Klantnummer, naam, adres, telefoon, e-mail en IBAN kunnen inline
            aangepast worden zolang de lead nog niet in een eindfase zit.
          </InfoBox>

          <InfoBox title="Toestelgegevens" tone="gray">
            Model, variant, opslag, SKU, IMEI/SN, batterijpercentage en gebruikte
            onderdelen kunnen aangepast worden zolang de status dat nog toelaat.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "prijs",
    title: "Prijs aanpassen",
    summary: "Hoe de prijs inline beheerd wordt.",
    searchText:
      "prijs aanpassen inline voucher effectieve prijs finale prijs opslaan diskette icoon",
    content: (
      <>
        <p>
          De prijs kan inline aangepast worden zolang de lead nog niet in een
          eindstatus zit. Na het aanpassen klik je op het opslaan-icoon.
        </p>
        <InfoBox title="Opmerking" tone="yellow">
          Bij leads met voucher wordt de juiste effectieve prijs weergegeven op
          basis van de gekozen betaalmethode.
        </InfoBox>
      </>
    ),
  },
  {
    id: "verzending",
    title: "Verzending en labelbeheer",
    summary: "Tracking, labels en resync voor verzenddossiers.",
    searchText:
      "verzending labelbeheer tracking label download resync verzendlabel traceer pakket sendcloud",
    content: (
      <>
        <p>
          Bij leads met levermethode <strong>verzenden</strong> verschijnt een
          extra blok <strong>Verzending &amp; label</strong>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoBox title="Traceer pakket" tone="blue">
            Opent de trackinglink van het pakket.
          </InfoBox>
          <InfoBox title="Download label" tone="blue">
            Laat het verzendlabel downloaden.
          </InfoBox>
          <InfoBox title="Resync" tone="yellow">
            Probeert tracking en label opnieuw op te halen en de labelmail
            opnieuw te versturen.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "historiek",
    title: "Statuslog en historiek",
    summary: "Wie heeft wat gewijzigd en wanneer?",
    searchText:
      "historiek statuslog log prijswijzigingen statuswijzigingen toestelgegevens wie wanneer admin user tijdstip",
    content: (
      <>
        <p>In het orderdetail-uitklapblok zie je onder meer:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>statuswijzigingen</li>
          <li>prijswijzigingen</li>
          <li>wijzigingen aan toestelgegevens</li>
        </ul>

        <InfoBox title="Waarom dit nuttig is" tone="gray">
          Zo kan je altijd nagaan welke medewerker een wijziging heeft gedaan en
          op welk moment.
        </InfoBox>
      </>
    ),
  },
  {
    id: "annulatie",
    title: "Annuleren van een lead",
    summary: "Een annulatie vereist altijd een reden.",
    searchText:
      "annuleren lead geannuleerd reden annulatie fake order technische problemen klant bedacht niet akkoord prijs test order",
    content: (
      <>
        <p>
          Wanneer een lead naar <strong>Geannuleerd</strong> gezet wordt, moet
          verplicht een <strong>reden van annulatie</strong> gekozen worden.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            "Fake order",
            "Technische problemen met toestel",
            "Klant heeft zich bedacht",
            "Klant niet akkoord met nieuwe prijs",
            "Klant vindt dat het te lang duurt",
            "Test Order",
          ].map((r) => (
            <div
              key={r}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {r}
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "rechten",
    title: "Rechten en toegangsbeheer",
    summary: "Niet elke gebruiker kan alles uitvoeren.",
    searchText:
      "rechten toegangsbeheer leads lezen schrijven finalize finale verwerking permissies",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1">
          <li>Leads lezen</li>
          <li>Leads schrijven</li>
          <li>Finale verwerking uitvoeren</li>
        </ul>

        <InfoBox title="Voorbeeld" tone="yellow">
          Een gebruiker zonder schrijfrechten kan de pagina wel bekijken, maar
          geen wijzigingen opslaan.
        </InfoBox>
      </>
    ),
  },
  {
    id: "praktisch",
    title: "Praktische werkwijze",
    summary: "Aanbevolen manier van werken voor medewerkers.",
    searchText:
      "praktische werkwijze dropoff lead verwerken ship lead verwerken stappen klantnummer reminder ontvangen zending controle",
    content: (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InfoBox title="Dropoff-lead verwerken" tone="green">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open de lead.</li>
              <li>Controleer of het klantnummer ingevuld is.</li>
              <li>Zet indien nodig naar een reminderstatus.</li>
              <li>Zodra het toestel binnen is: Ontvangen in de winkel.</li>
              <li>Vul toestelgegevens aan.</li>
              <li>Kies de juiste controle-uitkomst.</li>
              <li>Werk af wanneer alles verwerkt is.</li>
            </ol>
          </InfoBox>

          <InfoBox title="Ship-lead verwerken" tone="blue">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open de lead.</li>
              <li>Controleer of het klantnummer ingevuld is.</li>
              <li>Zet naar Verzendlabel aangemaakt.</li>
              <li>Gebruik indien nodig reminderstatussen.</li>
              <li>Zodra het pakket binnen is: Zending ontvangen.</li>
              <li>Vul toestelgegevens aan.</li>
              <li>Registreer controle-uitkomst.</li>
              <li>Werk af wanneer alles verwerkt is.</li>
            </ol>
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "problemen",
    title: "Waarom een status soms niet zichtbaar is of opslaan niet lukt",
    summary: "Meest voorkomende oorzaken.",
    searchText:
      "problemen status niet zichtbaar opslaan lukt niet foutmelding vereiste velden ontbreken ongeldige overgang onvoldoende rechten database validatie",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoBox title="Status niet zichtbaar" tone="yellow">
            Dat komt meestal doordat een vereist veld ontbreekt, de lead al in
            een eindstatus zit of de levermethode niet past bij de gekozen flow.
          </InfoBox>

          <InfoBox title="Opslaan lukt niet" tone="red">
            Mogelijke oorzaken: verplichte velden ontbreken, annulatie zonder
            reden, ongeldige overgang, onvoldoende rechten of database-validatie.
          </InfoBox>
        </div>
      </>
    ),
  },
  {
    id: "samenvatting",
    title: "Samenvatting",
    summary: "De kernregels in één oogopslag.",
    searchText:
      "samenvatting kernregels flow verzenden binnenbrengen klantnummer imei reminders ontvangen eindstatus historiek",
    content: (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            "Juiste flow volgens verzenden of binnenbrengen",
            "Klantnummer vereist om vanuit Nieuw verder te gaan",
            "IMEI vereist voor gefaalde controle",
            "Meerdere velden vereist voor succesvolle controle",
            "Reminders laten altijd terug naar ontvangen toe",
            "Geannuleerd en afgewerkt zijn eindstatussen",
            "Alle belangrijke wijzigingen worden gelogd",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800"
            >
              {item}
            </div>
          ))}
        </div>
      </>
    ),
  },
];

export default function LeadsHelpClient() {
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;

    return sections.filter((section) => {
      const haystack = [
        section.title,
        section.summary ?? "",
        section.searchText,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [query]);

  const noResults = filteredSections.length === 0;

  return (
    <div className="w-full min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" id="top">
        <div className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white shadow-sm">
          <div className="p-6 md:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full bg-white border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 mb-3">
                Leads • Helpcentrum
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
                Handleiding voor de Leads-module
              </h1>
              <p className="text-sm md:text-base text-gray-600 mt-2">
                Alles over statussen, flows, klant- en toestelgegevens,
                verzending, labels, validaties en de correcte manier van werken.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/leads" className="bb-btn h-9 text-xs px-3">
                ← Terug naar Leads
              </Link>
              <a href="#inhoud" className="bb-btn h-9 text-xs px-3">
                Naar inhoud
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Belangrijk</div>
            <div className="mt-1 text-sm text-gray-800">
              Vanuit <strong>Nieuw</strong> kan je alleen verder als het{" "}
              <strong>klantnummer</strong> ingevuld is, behalve naar{" "}
              <strong>Geannuleerd</strong>.
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Controle</div>
            <div className="mt-1 text-sm text-gray-800">
              Voor <strong>Controle gefaald</strong> is IMEI/SN vereist. Voor{" "}
              <strong>Controle succesvol</strong> zijn meerdere velden verplicht.
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-medium text-gray-500">Eindstatus</div>
            <div className="mt-1 text-sm text-gray-800">
              <strong>Geannuleerd</strong> en <strong>Afgewerkt</strong> zijn
              eindstatussen en laten geen verdere overgang meer toe.
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <label className="block">
            <span className="text-sm font-medium text-gray-900">
              Zoek in deze handleiding
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op bv. klantnummer, reminder, IMEI, label, geannuleerd..."
              className="mt-2 bb-input h-10 w-full text-sm px-3"
            />
          </label>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {query.trim()
                ? `${filteredSections.length} hoofdstuk(ken) gevonden`
                : `${sections.length} hoofdstukken beschikbaar`}
            </p>

            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs underline text-gray-600 hover:text-gray-900"
              >
                Zoekopdracht wissen
              </button>
            ) : null}
          </div>
        </div>

        <div
          id="inhoud"
          className="grid grid-cols-1 lg:grid-cols-[290px,minmax(0,1fr)] gap-6"
        >
          <aside className="lg:sticky lg:top-4 self-start">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Inhoud
              </h2>
              <nav className="space-y-1 max-h-[75vh] overflow-auto pr-1">
                {filteredSections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-sky-50 hover:text-sky-800"
                  >
                    {section.title}
                  </a>
                ))}
                {noResults ? (
                  <div className="text-sm text-gray-400 px-2 py-2">
                    Geen resultaten voor deze zoekopdracht.
                  </div>
                ) : null}
              </nav>
            </div>
          </aside>

          <main className="space-y-4">
            {noResults ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Geen resultaten gevonden
                </h2>
                <p className="text-sm text-gray-600 mt-2">
                  Probeer een andere zoekterm zoals <em>IMEI</em>, <em>label</em>,{" "}
                  <em>klantnummer</em>, <em>geannuleerd</em> of <em>reminder</em>.
                </p>
              </div>
            ) : (
              filteredSections.map((section) => (
                <SectionCard
                  key={section.id}
                  id={section.id}
                  title={section.title}
                  summary={section.summary}
                >
                  {section.content}
                </SectionCard>
              ))
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
