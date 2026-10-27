// Pure AFS contract; no customer-facing mail and no payment-status inference.
export const TRUSTPILOT_AFS_EMAIL = 'microforce.be+10c2ba8b1d@invite.trustpilot.com';
export const TRUSTPILOT_DELAY_DAYS = 7;
export type TrustpilotRecord = {
  lead_id: string; reference_id: string; recipient_name: string; recipient_email: string;
  mode: 'preview' | 'live' | 'test'; status: string; completed_at: string; expected_invite_at: string;
  test_send_at?: string | null;
  afs_email: string; delay_days: number; error_code: string | null;
  first_attempt_at?: string | null; provider_id?: string | null; submitted_at?: string | null;
  envelope?: {from: string; to: string; subject: string; html: string} | null;
};
export function trustpilotIssues(row: Pick<TrustpilotRecord, 'recipient_email' | 'recipient_name' | 'reference_id'>): string[] {
  const issues: string[] = [];
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.recipient_email) || row.recipient_email.length > 254) issues.push('email');
  if (!row.recipient_name.trim() || row.recipient_name.length > 250) issues.push('name');
  if (!row.reference_id.trim() || row.reference_id.length > 250 || /[\r\n]/.test(row.reference_id)) issues.push('reference');
  return issues;
}
export function buildTrustpilotEnvelope(row: TrustpilotRecord, from: string) {
  if (trustpilotIssues(row).length) throw new Error('Ontbrekende of ongeldige klantgegevens.');
  if (row.afs_email !== TRUSTPILOT_AFS_EMAIL || row.delay_days !== TRUSTPILOT_DELAY_DAYS) throw new Error('Ongeldige Trustpilot-instellingen.');
  if(row.mode==='test'&&(!row.test_send_at||!Number.isFinite(Date.parse(row.test_send_at)))) throw new Error('Testverzendmoment ontbreekt.');
  const json = JSON.stringify({recipientName: row.recipient_name, recipientEmail: row.recipient_email, referenceId: row.reference_id,
    ...(row.mode==='test'?{preferredSendTime:row.test_send_at}:{})})
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return {from, to: TRUSTPILOT_AFS_EMAIL, subject: `Microforce Buyback afgerond ${row.reference_id}`,
    html: `<script type="application/json+trustpilot">${json}</script>`};
}
export function trustpilotLiveAllowed(env: Record<string, string | undefined>): boolean {
  // Fail closed even when a TEST project uses Vercel's Production target.
  const live = 'https://poqyuyqguumfmldwffdv.supabase.co';
  return env.TRUSTPILOT_SEND_ENABLED === 'true' && env.NEXT_PUBLIC_SUPABASE_URL === live
    && (!env.SUPABASE_URL || env.SUPABASE_URL === live) && env.VERCEL_ENV === 'production'
    && !!env.RESEND_API_KEY && !!env.MAIL_FROM;
}
export const trustpilotStatusLabels: Record<string, string> = {
  preview: 'Proefmelding klaar — niets verzonden', blocked: 'Klantgegevens aanvullen', queued: 'Klaar voor melding',
  sending: 'Verzending wordt gecontroleerd', submitted: 'Melding door maildienst aanvaard', failed: 'Melding mislukt', uncertain: 'Verzendstatus handmatig controleren',
};
