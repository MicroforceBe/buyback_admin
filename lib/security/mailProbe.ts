import 'server-only';
import { requireAccess } from '@/lib/security/access';

export const TEST_MAIL_RECIPIENT = 'olivier@microforce.be';

export async function sendIntegrationTestMail(kind: string) {
  await requireAccess('leads', 'write', true);
  if (kind !== 'confirmation' && kind !== 'status') throw new Error('Ongeldige mailtest.');
  const expected = 'https://ekqmhexbabrwudetkfcm.supabase.co';
  if (process.env.SUPABASE_URL !== expected || process.env.NEXT_PUBLIC_SUPABASE_URL !== expected) {
    throw new Error('Mailtest alleen beschikbaar in het afzonderlijke testproject.');
  }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    throw new Error('Stel RESEND_API_KEY en MAIL_FROM in voor de testadmin.');
  }
  const input = {
    to: TEST_MAIL_RECIPIENT,
    first_name: 'TEST',
    last_name: 'Mailcontrole',
    order_code: kind === 'confirmation' ? 'TEST-MAIL-BEVESTIGING' : 'TEST-MAIL-STATUS',
    model: 'TEST Device',
    capacity_gb: 128,
    final_price_cents: 10000,
    wants_voucher: true,
    delivery_method: 'dropoff' as const,
    shop_location: 'TEST Active Shop',
    questions_answers_html: '<p>TEST — fictieve toestelgegevens, geen echte aanvraag.</p>',
  };
  if (kind === 'confirmation') {
    const { sendStatusMail } = await import('@/app/api/buyback/email/sendStatusMail');
    const result = await sendStatusMail({ ...input, base_price_cents: 10000 });
    if ('skipped' in result || result?.error || !result?.data?.id) {
      throw new Error('Bevestigingsmail werd niet aanvaard door de mailprovider.');
    }
  } else {
    const { sendStatusUpdateMail } = await import('@/lib/email/sendStatusUpdateMail');
    const result = await sendStatusUpdateMail({ ...input, status: 'received_store' });
    if (!result?.id) throw new Error('Statusmail werd niet aanvaard door de mailprovider.');
  }
}
