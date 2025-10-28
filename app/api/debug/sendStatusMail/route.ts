import { NextResponse, NextRequest } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Resend client + afzender
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.MAIL_FROM!;                 // bv. "Buyback <noreply@jouwdomein.be>"
const REPLY_TO = process.env.MAIL_REPLY_TO ?? FROM;  // optioneel andere reply-to

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    // ✅ Deze bestonden nog niet: maak ze aan
    const subject = `Bevestiging buyback order ${data.order_code ?? ""}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2>Bedankt voor je aanvraag${data.first_name ? `, ${data.first_name}` : ""}!</h2>
        <p>We hebben je buyback geregistreerd onder referentie
          <strong style="font-family:ui-monospace,Menlo,Consolas,monospace">${data.order_code ?? "—"}</strong>.
        </p>
        <ul>
          <li><strong>Model:</strong> ${data.model ?? "—"} ${data.capacity_gb ? `• ${data.capacity_gb} GB` : ""}</li>
          <li><strong>Methode:</strong> ${data.delivery_method === "dropoff" ? "Binnenbrengen in winkel" : "Verzenden"}</li>
          ${data.shop_location ? `<li><strong>Winkel:</strong> ${data.shop_location}</li>` : ""}
          <li><strong>Geschatte prijs:</strong> €${((data.final_price_cents ?? 0) / 100).toFixed(2)}</li>
          ${data.wants_voucher ? "<li><strong>Voucher:</strong> Ja (+5%)</li>" : ""}
        </ul>
        <p>Je ontvangt een update zodra de status wijzigt.</p>
      </div>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to: data.email!,
      replyTo: REPLY_TO,
      subject,     // ✅ nu bestaat 'subject'
      html,        // ✅ en 'html' ook
    });

    return NextResponse.json({
      ok: true,
      id: res.data?.id ?? null,
      sent_to: data.email ?? null,
      order_code: data.order_code ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, expects: "POST" });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}
