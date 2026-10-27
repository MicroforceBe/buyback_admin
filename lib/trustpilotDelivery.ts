import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildTrustpilotEnvelope, trustpilotLiveAllowed, type TrustpilotRecord } from './trustpilot';

// Trigger persistence precedes this best-effort sender. Pending work stays visible for an admin retry.
// Preview records are NEVER converted to live records, including after configuration changes.
export async function processTrustpilotRegistration(leadId: string): Promise<string> {
  const sb = supabaseAdmin;
  const {data: row, error} = await sb.from('buyback_trustpilot_invitations').select('*').eq('lead_id', leadId).maybeSingle();
  if (error) throw new Error('Trustpilot-registratie kon niet geladen worden.');
  if (!row) return 'not_registered';
  const q = row as TrustpilotRecord;
  if (q.mode === 'preview' || !['queued','failed'].includes(q.status)) return q.status;
  const isTest = q.mode === 'test';
  const testEnv = 'https://ekqmhexbabrwudetkfcm.supabase.co';
  if(isTest) {
    if(process.env.NEXT_PUBLIC_SUPABASE_URL!==testEnv || (process.env.SUPABASE_URL&&process.env.SUPABASE_URL!==testEnv)
      || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return 'disabled';
    const {data:allow,error:allowError}=await sb.from('buyback_trustpilot_test_authorization').select('lead_id,recipient_email,expires_at').eq('id',true).single();
    if(allowError||!allow||allow.lead_id!==leadId||allow.recipient_email!==q.recipient_email||Date.parse(allow.expires_at)<=Date.now()) return 'disabled';
  } else if (!trustpilotLiveAllowed(process.env)) return 'disabled';
  const {data: config, error: configError} = await sb.from('buyback_trustpilot_config').select('mode').eq('id',true).single();
  if (configError || config?.mode !== (isTest?'preview':'live')) return 'disabled';
  const {data: lead, error: leadError} = await sb.from('buyback_leads').select('status,source,email,order_code').eq('id',leadId).single();
  if (leadError || lead?.status !== 'done') return 'not_done';
  if(isTest&&(lead.source!=='trustpilot_e2e_test'||lead.email!==q.recipient_email||lead.order_code!=='TEST-TRUSTPILOT-E2E-20261027')) return 'disabled';

  const now = new Date();
  // Resend deduplicates for 24h; never blindly resend outside that window.
  if (q.first_attempt_at && now.getTime()-Date.parse(q.first_attempt_at) >= 23*60*60*1000) {
    const {error: expiredError} = await sb.from('buyback_trustpilot_invitations')
      .update({status:'uncertain',error_code:'retry_window_expired',updated_at:now.toISOString()}).eq('lead_id',leadId).eq('status',q.status);
    if (expiredError) throw new Error('Verzendstatus kon niet bijgewerkt worden.');
    return 'uncertain';
  }
  const envelope = q.envelope ?? buildTrustpilotEnvelope(q, process.env.MAIL_FROM!);
  const token = randomUUID();
  let claim = sb.from('buyback_trustpilot_invitations').update({status:'sending',attempt_token:token,
    first_attempt_at:q.first_attempt_at ?? now.toISOString(),envelope,updated_at:now.toISOString()})
    .eq('lead_id',leadId).eq('status',q.status);
  claim = q.first_attempt_at ? claim.eq('first_attempt_at',q.first_attempt_at) : claim.is('first_attempt_at',null);
  const {data: claimed, error: claimError} = await claim.select('lead_id').maybeSingle();
  if (claimError) throw new Error('Melding kon niet gereserveerd worden.');
  if (!claimed) return 'busy';
  let status = 'uncertain', providerId: string | null = null, issue: string | null = 'delivery_unconfirmed';
  try {
    // Separate To-only trigger: customer is in the AFS JSON, never To/CC/BCC.
    const response = await fetch('https://api.resend.com/emails', {method:'POST',signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json',
        'Idempotency-Key':`buyback-trustpilot/${leadId}`},body:JSON.stringify(envelope)});
    const result = await response.json();
    if (response.ok && typeof result.id === 'string' && result.id) { status='submitted'; providerId=result.id; issue=null; }
    else if (!response.ok) { status='failed'; issue='provider_rejected'; }
  } catch { /* Acceptance is unknown: do not retry automatically after a timeout. */ }
  const {error: finishError} = await sb.from('buyback_trustpilot_invitations').update({status,error_code:issue,
    provider_id:providerId,submitted_at:providerId ? new Date().toISOString() : null,updated_at:new Date().toISOString()})
    .eq('lead_id',leadId).eq('attempt_token',token).eq('status','sending');
  if (finishError) throw new Error('Melding mogelijk aanvaard; controleer de verzendstatus vóór opnieuw verzenden.');
  return status;
}
