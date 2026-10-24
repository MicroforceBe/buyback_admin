import { requireAccess } from '@/lib/security/access';
import { sendIntegrationTestMail, TEST_MAIL_RECIPIENT } from '@/lib/security/mailProbe';
import { redirect } from 'next/navigation';

export default async function MailTestPage({ searchParams }: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireAccess('leads', 'write', true);
  const params = await searchParams;
  const sent = params.result === 'confirmation' || params.result === 'status';
  async function send(form: FormData) {
    'use server';
    await requireAccess('leads', 'write', true);
    const kind = String(form.get('kind') || '');
    let success = false;
    try {
      await sendIntegrationTestMail(kind);
      success = true;
    } catch {
      // Never show SDK responses, provider messages or credentials.
    }
    redirect('/admin/mail-test?result=' + (success ? kind : 'failed'));
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <h1 className="text-xl font-semibold">E-mailcontrole in de testomgeving</h1>
      <p>Deze test gebruikt fictieve gegevens en stuurt uitsluitend naar {TEST_MAIL_RECIPIENT}. Er wordt geen aanvraag of verzendlabel aangemaakt.</p>
      {sent && <p role="status">De mailprovider heeft de testmail aanvaard. Controleer je inbox en ongewenste e-mail.</p>}
      {params.result === 'failed' && <p role="alert">Versturen niet bevestigd. Controleer de mailinstellingen van de testadmin en de mailprovider.</p>}
      <form action={send} className="flex gap-3">
        <button type="submit" name="kind" value="confirmation" className="rounded border px-4 py-2">Test aanvraagbevestiging</button>
        <button type="submit" name="kind" value="status" className="rounded border px-4 py-2">Test statusmail</button>
      </form>
    </main>
  );
}
