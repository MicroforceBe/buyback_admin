'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

// TEST-only fixture control. Never calls customer, finance or Trustpilot mail senders.
export async function finishTrustpilotFixtureAction() {
  await requireAccess('leads','write',true);
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://ekqmhexbabrwudetkfcm.supabase.co') throw new Error('Alleen beschikbaar in de testomgeving.');
  const {data:cfg,error:cfgError}=await supabaseAdmin.from('buyback_trustpilot_config').select('mode').eq('id',true).single();
  if(cfgError||cfg?.mode!=='preview') throw new Error('Proefmodus is niet actief.');
  const {error}=await supabaseAdmin.from('buyback_leads').update({status:'done',updated_at:new Date().toISOString()})
    .eq('source','trustpilot_preview').eq('order_code','TEST-TRUSTPILOT-AFRONDEN').eq('email','preview@example.invalid').eq('status','check_passed');
  if(error) throw new Error('Testbuyback kon niet afgerond worden.');
  revalidatePath('/admin/leads/trustpilot');
  revalidatePath('/admin/leads');
  redirect('/admin/leads/trustpilot?msg=fixture_finished');
}
