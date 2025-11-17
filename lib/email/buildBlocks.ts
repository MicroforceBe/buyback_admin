// lib/email/buildBlocks.ts
import type { BuybackStatus } from "@/lib/email/templates";

export type EmailBlocksInput = {
  status: BuybackStatus;

  model?: string | null;
  capacity_gb?: number | null;
  final_price_cents?: number | null;

  delivery_method?: string | null;
  shop_location?: string | null;

  wants_voucher?: boolean | null;
  iban?: string | null;

  tracking_url?: string | null;
  label_pdf_url?: string | null;
};

export type EmailBlocks = {
  details_table_html?: string;
  delivery_block_html?: string;
  payout_block_html?: string;
  next_steps_html?: string;
};

function formatPrice(final_price_cents?: number | null): string {
  if (final_price_cents == null) return "-";
  const eur = final_price_cents / 100;
  return eur.toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Bouwt een eenvoudige HTML-tabel met toestel + richtprijs.
 */
function buildDetailsTable(input: EmailBlocksInput): string | undefined {
  const hasDevice =
    (input.model && input.model.trim().length > 0) || input.capacity_gb != null;
  const hasPrice = input.final_price_cents != null;

  if (!hasDevice && !hasPrice) return undefined;

  const model = input.model ?? "Onbekend toestel";
  const capacity =
    input.capacity_gb != null ? `${input.capacity_gb} GB` : "n.v.t.";
  const price = formatPrice(input.final_price_cents);

  return `
<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:480px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;">
  <thead>
    <tr>
      <th align="left" style="border-bottom:1px solid #e5e7eb;">Toestel</th>
      <th align="left" style="border-bottom:1px solid #e5e7eb;">Opslag</th>
      <th align="right" style="border-bottom:1px solid #e5e7eb;">Richtprijs</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border-bottom:1px solid #f3f4f6;">${model}</td>
      <td style="border-bottom:1px solid #f3f4f6;">${capacity}</td>
      <td style="border-bottom:1px solid #f3f4f6;" align="right">${price}</td>
    </tr>
  </tbody>
</table>`.trim();
}

/**
 * Tekstblok over levering/retour, afhankelijk van delivery_method en tracking/label.
 */
function buildDeliveryBlock(input: EmailBlocksInput): string | undefined {
  const method = (input.delivery_method || "").toLowerCase();
  const shopLocation = input.shop_location || "";
  const trackingUrl = input.tracking_url || "";
  const labelUrl = input.label_pdf_url || "";

  // Versturen via bpost / Sendcloud
  if (method === "ship") {
    const lines: string[] = [];

    lines.push(
      "Je hebt gekozen om je toestel <strong>per post</strong> op te sturen."
    );

    if (labelUrl) {
      lines.push(
        `Je kan je retourlabel downloaden via: <a href="${labelUrl}" target="_blank" rel="noopener noreferrer">retourlabel (PDF)</a>.`
      );
    } else {
      lines.push(
        "Je ontvangt in een aparte mail of via deze mail een retourlabel. Print dit label en kleef het op je pakket."
      );
    }

    if (trackingUrl) {
      lines.push(
        `Je kan je zending volgen via: <a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">${trackingUrl}</a>.`
      );
    }

    lines.push(
      "Verpak je toestel zorgvuldig en bezorg het zo snel mogelijk aan het gekozen afgiftepunt."
    );

    return `<p>${lines.join("<br/>")}</p>`;
  }

  // Afgeven in de winkel
  if (method === "store") {
    const lines: string[] = [];

    lines.push(
      "Je hebt gekozen om je toestel <strong>in de winkel</strong> af te geven."
    );

    if (shopLocation) {
      lines.push(
        `Je kan terecht in: <strong>${shopLocation}</strong>.`
      );
    } else {
      lines.push(
        "Je kan terecht in de door jou gekozen winkel. Breng deze mail of je ordercode mee."
      );
    }

    lines.push(
      "Een medewerker zal je toestel nakijken en de finale overnameprijs bevestigen."
    );

    return `<p>${lines.join("<br/>")}</p>`;
  }

  // Onbekende / andere methode
  return undefined;
}

/**
 * Blok over uitbetaling: voucher vs overschrijving naar IBAN.
 */
function buildPayoutBlock(input: EmailBlocksInput): string | undefined {
  const wantsVoucher = input.wants_voucher;
  const iban = input.iban;

  if (wantsVoucher === true) {
    return `
<p>
  De uitbetaling gebeurt via een <strong>waardebon</strong> die je kan gebruiken in onze winkel(s).
  Je ontvangt deze voucher zodra je toestel werd goedgekeurd.
</p>`.trim();
  }

  if (iban) {
    return `
<p>
  De uitbetaling gebeurt via een <strong>bankoverschrijving</strong> op het rekeningnummer
  <strong>${iban}</strong>. Wij verwerken de betaling nadat je toestel werd nagekeken en goedgekeurd.
</p>`.trim();
  }

  return `
<p>
  De uitbetaling gebeurt nadat je toestel werd nagekeken en goedgekeurd. Indien nodig nemen we contact met je op om de betaalmethode verder af te stemmen.
</p>`.trim();
}

/**
 * Korte "volgende stappen" tekst op basis van status.
 */
function buildNextStepsBlock(input: EmailBlocksInput): string | undefined {
  const status = input.status;

  switch (status) {
    case "new":
      return `
<ul>
  <li>Controleer je gegevens en besteloverzicht.</li>
  <li>Volg de instructies in deze mail om je toestel te verzenden of binnen te brengen.</li>
</ul>`.trim();

    case "label_created":
      return `
<ul>
  <li>Download en print je retourlabel.</li>
  <li>Verpak je toestel goed beschermd.</li>
  <li>Breng je pakket naar het opgegeven afgiftepunt.</li>
</ul>`.trim();

    case "shipment_received":
      return `
<p>
  We hebben je toestel ontvangen. Onze technici zullen het zo snel mogelijk nakijken.
  Je ontvangt een update zodra de controle is afgerond.
</p>`.trim();

    case "check_passed":
      return `
<p>
  Je toestel is <strong>goedgekeurd</strong>. We verwerken nu de uitbetaling volgens de door jou gekozen methode.
  Je ontvangt een bevestiging zodra de betaling is uitgevoerd.
</p>`.trim();

    case "check_failed":
      return `
<p>
  Tijdens de controle zijn één of meerdere afwijkingen vastgesteld t.o.v. de opgegeven staat.
  We nemen contact met je op om de verdere afhandeling te bespreken.
</p>`.trim();

    case "done":
      return `
<p>
  Je buyback-aanvraag is volledig afgerond. Bedankt om je toestel via ons in te leveren!
</p>`.trim();

    default:
      return undefined;
  }
}

/**
 * Publieke helper: bouwt alle blokken in één keer.
 */
export function buildEmailBlocks(input: EmailBlocksInput): EmailBlocks {
  return {
    details_table_html: buildDetailsTable(input),
    delivery_block_html: buildDeliveryBlock(input),
    payout_block_html: buildPayoutBlock(input),
    next_steps_html: buildNextStepsBlock(input),
  };
}
