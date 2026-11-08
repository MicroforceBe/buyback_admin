'use server';
// Marketing actions (admin-only): refresh the Google figures, the one-time Merchant API registration and the own feed.
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { createFeedDataSource, googleSettings, registerMerchant } from '@/lib/marketing/google';
import { COUNTRY, CONTENT_LANGUAGE, FEED_LABEL, parseProductIds } from '@/lib/marketing/merchantFeed';
import { runMerchantFeed } from '@/lib/marketing/merchantFeedRun';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

// Own Merchant feed (admin-only). Creating the data source and choosing the mode are explicit admin steps.
export async function createFeedDataSourceAction() {
  await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const { sa, merchant } = googleSettings();
    if (!sa || !merchant) throw new Error('Serviceaccount of MERCHANT_CENTER_ID ontbreekt.');
    const { data: current } = await supabaseAdmin.from('merchant_feed_settings').select('data_source').eq('id', true).maybeSingle();
    if (current?.data_source) throw new Error('Er is al een gegevensbron ingesteld.');
    const name = await createFeedDataSource(sa, merchant, { displayName: 'buyback-admin (eigen feed)', contentLanguage: CONTENT_LANGUAGE, feedLabel: FEED_LABEL, countries: [COUNTRY] });
    const { error } = await supabaseAdmin.from('merchant_feed_settings').update({ data_source: name, updated_at: new Date().toISOString(), updated_by: 'beheerder' }).eq('id', true);
    if (error) throw new Error(`Gegevensbron ${name} is aangemaakt maar kon niet worden bewaard. Meld dit, zodat ze wordt ingevuld en er geen tweede komt.`);
    target = back({ ok: `Gegevensbron aangemaakt in Merchant Center: ${name}.` });
  } catch (error) {
    target = back({ error: (error instanceof Error ? error.message : 'Aanmaken mislukt.').slice(0, 300) });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function saveFeedSettingsAction(form: FormData) {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const mode = String(form.get('mode') ?? '');
    if (!['off', 'test', 'live'].includes(mode)) throw new Error('Ongeldige modus.');
    const testProducts = parseProductIds(String(form.get('test_products') ?? ''));
    if (testProducts.length > 20) throw new Error('Maximaal 20 testproducten.');
    if (mode === 'test' && !testProducts.length) throw new Error('Geef minstens één testproduct (Shopify-product-ID of link).');
    // Live sends the same offer IDs as Channable: both feeds at once gives duplicates in Merchant Center.
    if (mode === 'live' && form.get('channable_off') !== 'on') throw new Error('Bevestig eerst dat de Google-feeds in Channable uit staan.');
    const max = Number(form.get('max_changes') ?? 1500);
    if (!Number.isInteger(max) || max < 1 || max > 100000) throw new Error('Maximum moet tussen 1 en 100000 liggen.');
    const { data: current } = await supabaseAdmin.from('merchant_feed_settings').select('data_source').eq('id', true).maybeSingle();
    if (mode !== 'off' && !current?.data_source) throw new Error('Maak eerst de gegevensbron aan.');
    const { error } = await supabaseAdmin.from('merchant_feed_settings').update({ mode, test_products: testProducts, max_changes: max, updated_at: new Date().toISOString(), updated_by: String(user.email ?? 'beheerder') }).eq('id', true);
    if (error) throw new Error('Instellingen konden niet worden bewaard.');
    target = back({ ok: `Feed: modus ${mode}${mode === 'test' ? ` met ${testProducts.length} testproduct(en)` : ''}.` });
  } catch (error) {
    target = back({ error: (error instanceof Error ? error.message : 'Bewaren mislukt.').slice(0, 300) });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function runFeedAction() {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const r = await runMerchantFeed({ trigger: 'manual', actor: String(user.email ?? 'beheerder') });
    target = r.status === 'skipped'
      ? back({ error: r.reason === 'off' ? 'De feed staat uit.' : r.reason === 'running' ? 'Er loopt al een run.' : 'Shopify, Google of de gegevensbron is niet ingesteld.' })
      : r.status === 'succeeded' ? back({ ok: `Feed: ${String(r.counts.sent ?? 0)} verstuurd, ${String(r.counts.removed ?? 0)} verwijderd, ${String(r.counts.unchanged ?? 0)} ongewijzigd.` })
      : back({ error: r.error ?? 'De run is niet gelukt.' });
  } catch (error) {
    target = back({ error: (error instanceof Error ? error.message : 'De run is niet gelukt.').slice(0, 300) });
  }
  revalidatePath(PATH);
  redirect(target);
}
