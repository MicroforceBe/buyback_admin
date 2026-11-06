'use server';
// Server actions for the Shopify sync page. Mode changes and manual runs are admin-only;
// anyone with ERP write access may switch the sync off (emergency stop).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { runShopifySync } from '@/lib/shopify/sync';
import { MODES, PATH, back } from './modes';

export async function saveSettingsAction(formData: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const mode = String(formData.get('mode') ?? '');
  const maxChanges = Number(formData.get('max_changes'));
  const version = Number(formData.get('version'));
  const createDrafts = formData.get('create_drafts') === 'on';
  if (!Object.hasOwn(MODES, mode) || !Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 100000) redirect(back({ error: 'Ongeldige instellingen.' }));
  const { data, error } = await supabaseAdmin.from('shopify_sync_settings')
    .update({ mode, max_changes: maxChanges, create_drafts: createDrafts, version: version + 1, updated_at: new Date().toISOString(), updated_by: String(user.email ?? 'admin') })
    .eq('id', true).eq('version', version).select('id');
  if (error) redirect(back({ error: 'Opslaan mislukt.' }));
  if (!data?.length) redirect(back({ error: 'Iemand anders wijzigde de instellingen intussen. Controleer en probeer opnieuw.' }));
  revalidatePath(PATH);
  redirect(back({ saved: '1' }));
}

export async function stopAction() {
  const user = await requireAccess('erp', 'write', false);
  // Compare-and-swap on the version, retried, so every successful stop advances the version and
  // invalidates settings forms rendered before it. Only reported once the row really says 'off'.
  let stopped = false;
  for (let attempt = 0; attempt < 5 && !stopped; attempt++) {
    const { data: current } = await supabaseAdmin.from('shopify_sync_settings').select('version').eq('id', true).single();
    if (!current) break;
    const { data, error } = await supabaseAdmin.from('shopify_sync_settings')
      .update({ mode: 'off', version: current.version + 1, updated_at: new Date().toISOString(), updated_by: String(user.email ?? 'admin') })
      .eq('id', true).eq('version', current.version).select('mode');
    if (error) break;
    stopped = data?.[0]?.mode === 'off';
  }
  revalidatePath(PATH);
  if (!stopped) redirect(back({ error: 'Noodstop mislukt: de synchronisatie staat mogelijk nog aan. Probeer opnieuw of zet de modus op Uit.' }));
  redirect(back({ saved: 'stop' }));
}

export async function runNowAction() {
  const user = await requireAccess('erp', 'write', true);
  let target = '';
  try {
    const result = await runShopifySync({ trigger: 'manual', actor: String(user.email ?? 'admin') });
    target = result.status === 'skipped' ? back({ error: { off: 'De synchronisatie staat uit.', running: 'Er loopt al een synchronisatie.', not_configured: 'Shopify is nog niet gekoppeld (omgevingsvariabelen ontbreken).' }[result.reason] }) : back({ run: result.runId });
  } catch {
    target = back({ error: 'Synchronisatie kon niet starten.' });
  }
  revalidatePath(PATH);
  redirect(target);
}
