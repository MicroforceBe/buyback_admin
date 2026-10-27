'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { processTrustpilotRegistration } from '@/lib/trustpilotDelivery';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function refreshTrustpilotAction(form: FormData) {
  await requireAccess('leads','write',true);
  const id = String(form.get('lead_id') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Ongeldige buyback.');
  const {error} = await supabaseAdmin.rpc('refresh_buyback_trustpilot',{p_lead_id:id});
  let msg = error ? 'refresh_failed' : 'refreshed';
  if (!error) {
    try { await processTrustpilotRegistration(id); } catch { msg='delivery_check'; }
  }
  revalidatePath('/admin/leads/trustpilot');
  redirect('/admin/leads/trustpilot?msg='+msg);
}

export async function retryTrustpilotAction(form: FormData) {
  await requireAccess('leads','write',true);
  const id = String(form.get('lead_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Ongeldige buyback.');
  let msg='processed';
  try { await processTrustpilotRegistration(id); } catch { msg='delivery_check'; }
  revalidatePath('/admin/leads/trustpilot');
  redirect('/admin/leads/trustpilot?msg='+msg);
}
