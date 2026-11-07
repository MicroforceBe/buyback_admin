'use server';
// Marketing actions (admin-only): refresh the Google figures, and the one-time Merchant API registration.
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { googleSettings, registerMerchant } from '@/lib/marketing/google';

const PATH = '/admin/marketing';
const back = (params: Record<string, string>) => `${PATH}?${new URLSearchParams(params)}`;

export async function refreshGoogleAction() {
  await requireAccess('erp', 'write', true);
  revalidateTag('marketing-google');
  revalidatePath(PATH);
  redirect(back({ ok: 'Google-cijfers worden opnieuw opgehaald.' }));
}

export async function registerMerchantAction() {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const { sa, merchant } = googleSettings();
    if (!sa || !merchant) throw new Error('Serviceaccount of MERCHANT_CENTER_ID ontbreekt.');
    // The logged-in admin becomes the technical contact; Google may send an invitation to accept.
    await registerMerchant(sa, merchant, String(user.email ?? ''));
    revalidateTag('marketing-google');
    target = back({ ok: `Geregistreerd met ${user.email} als technisch contact. Aanvaard de uitnodiging van Google als die binnenkomt; na enkele minuten verschijnen de cijfers.` });
  } catch (error) {
    target = back({ error: (error instanceof Error ? error.message : 'Registratie mislukt.').slice(0, 300) });
  }
  revalidatePath(PATH);
  redirect(target);
}
