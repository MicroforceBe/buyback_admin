import 'server-only';
// Mails van de webshop-verwittigingen via Resend. Afzender: SHOP_MAIL_FROM (bv. "Microforce <info@microforce.be>"),
// anders MAIL_FROM. Met List-Unsubscribe, zodat mailprogramma's een uitschrijfknop tonen.
import { Resend } from 'resend';
import type { Mail } from './core';

export async function sendShopMail(to: string, mail: Mail, unsubscribe: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SHOP_MAIL_FROM || process.env.MAIL_FROM;
  if (!key || !from) throw new Error('Maildienst niet ingesteld.');
  const result = await new Resend(key).emails.send({
    from, to, subject: mail.subject, html: mail.html, text: mail.text,
    headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
  });
  if (result.error || !result.data?.id) throw new Error('Mailprovider heeft het bericht niet aanvaard.');
}
