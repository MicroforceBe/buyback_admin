'use server';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { processTrustpilotRegistration } from '@/lib/trustpilotDelivery';

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

// Sends only the one database-authorized real test. No recipient supplied by the browser.
export async function sendTrustpilotRealTestAction() {
  await requireAccess('leads','write',true);
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://ekqmhexbabrwudetkfcm.supabase.co') throw new Error('Alleen beschikbaar in de testomgeving.');
  const {data:allow,error}=await supabaseAdmin.from('buyback_trustpilot_test_authorization').select('lead_id,recipient_email,expires_at').eq('id',true).single();
  if(error||!allow||Date.parse(allow.expires_at)<=Date.now()) throw new Error('Geen geldige eenmalige testtoestemming.');
  const {data:cfg,error:cfgError}=await supabaseAdmin.from('buyback_trustpilot_config').select('mode').eq('id',true).single();
  if(cfgError||cfg?.mode!=='preview') throw new Error('Proefmodus is niet actief.');
  const {error:updateError}=await supabaseAdmin.from('buyback_leads').update({status:'done',updated_at:new Date().toISOString()})
    .eq('id',allow.lead_id).eq('source','trustpilot_e2e_test').eq('order_code','TEST-TRUSTPILOT-E2E-20261027')
    .eq('email',allow.recipient_email).eq('status','check_passed');
  if(updateError) throw new Error('Testbuyback kon niet afgerond worden.');
  let result='delivery_check';
  try { result=await processTrustpilotRegistration(allow.lead_id); } catch { /* Registration stays inspectable. */ }
  revalidatePath('/admin/leads/trustpilot');revalidatePath('/admin/leads');
  redirect('/admin/leads/trustpilot?msg='+(result==='submitted'?'real_test_submitted':'delivery_check'));
}
