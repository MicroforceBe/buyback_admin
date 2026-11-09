'use server';
// Marketing actions (admin-only): refresh the Google figures, the one-time Merchant API registration and the own feed.
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { createFeedDataSource, googleSettings, registerMerchant } from '@/lib/marketing/google';
import { COUNTRY, CONTENT_LANGUAGE, FEED_LABEL, modelKey, parseProductIds, validGtin } from '@/lib/marketing/merchantFeed';
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

/** Store codes per Shopify location (Google Business Profile → Advanced settings → Store code). */
export async function saveStoreCodesAction(form: FormData) {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const codes: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (!key.startsWith('store:')) continue;
      const location = key.slice('store:'.length);
      const code = String(value).trim();
      if (!/^gid:\/\/shopify\/Location\/\d+$/.test(location)) throw new Error('Ongeldige locatie.');
      if (!code) continue;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) throw new Error(`Ongeldige winkelcode "${code.slice(0, 64)}": alleen letters, cijfers, - en _.`);
      codes[location] = code;
    }
    if (new Set(Object.values(codes)).size !== Object.values(codes).length) throw new Error('Elke winkel heeft een eigen winkelcode nodig.');
    const { error } = await supabaseAdmin.from('merchant_feed_settings').update({ store_codes: codes, updated_at: new Date().toISOString(), updated_by: String(user.email ?? 'beheerder') }).eq('id', true);
    if (error) throw new Error('Winkelcodes konden niet worden bewaard.');
    target = back({ ok: `Winkelcodes bewaard (${Object.keys(codes).length} winkel(s)).` });
  } catch (error) {
    target = back({ error: (error instanceof Error ? error.message : 'Bewaren mislukt.').slice(0, 300) });
  }
  revalidatePath(PATH);
  redirect(target);
}

/** Bulk GTIN per model: "model ; gtin ; source-url" per line. An empty GTIN removes the model's code. */
export async function saveGtinsAction(form: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const GTIN_PATH = '/admin/marketing/gtin';
  const backTo = (p: Record<string, string>) => `${GTIN_PATH}?${new URLSearchParams(p)}`;
  let target: string;
  try {
    const lines = String(form.get('lines') ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Geen regels ingevuld.');
    if (lines.length > 500) throw new Error('Maximaal 500 regels per keer.');
    const upserts: { model_key: string; gtin: string; source_url: string | null; updated_at: string; updated_by: string }[] = [];
    const removals: string[] = [];
    for (const [i, line] of lines.entries()) {
      const [rawKey = '', rawGtin = '', rawUrl = ''] = line.split(';').map(x => x.trim());
      const key = modelKey(rawKey);
      if (key.length < 3) throw new Error(`Regel ${i + 1}: geen model.`);
      if (!rawGtin) { removals.push(key); continue; }
      const gtin = validGtin(rawGtin.replace(/\s/g, ''));
      if (!gtin) throw new Error(`Regel ${i + 1}: "${rawGtin.slice(0, 20)}" is geen geldige GTIN (controlecijfer).`);
      if (rawUrl && !/^https:\/\/\S{3,490}$/.test(rawUrl)) throw new Error(`Regel ${i + 1}: de bron moet een https-link zijn.`);
      upserts.push({ model_key: key, gtin, source_url: rawUrl || null, updated_at: new Date().toISOString(), updated_by: String(user.email ?? 'beheerder') });
    }
    // Rows stored under an older spelling of the same model ("rood" for "red") are removed along with a
    // change, so a saved or withdrawn code is never shadowed or resurrected by a legacy row.
    const touched = new Set([...upserts.map(u => u.model_key), ...removals]);
    const legacy: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from('model_gtins').select('model_key').order('model_key').range(from, from + 999);
      if (error) throw new Error('GTIN-tabel kon niet worden gelezen.');
      for (const r of data ?? []) { const k = String(r.model_key); if (k !== modelKey(k) && touched.has(modelKey(k))) legacy.push(k); }
      if (!data || data.length < 1000) break;
    }
    if (upserts.length) {
      const { error } = await supabaseAdmin.from('model_gtins').upsert(upserts, { onConflict: 'model_key' });
      if (error) throw new Error('GTIN\'s konden niet worden bewaard.');
    }
    const toDelete = [...new Set([...removals, ...legacy])];
    if (toDelete.length) {
      const { error } = await supabaseAdmin.from('model_gtins').delete().in('model_key', toDelete);
      if (error) throw new Error('GTIN\'s konden niet worden verwijderd.');
    }
    target = backTo({ ok: `${upserts.length} GTIN('s) bewaard${removals.length ? `, ${removals.length} verwijderd` : ''}. De feed stuurt ze bij de volgende run mee.` });
  } catch (error) {
    target = backTo({ error: (error instanceof Error ? error.message : 'Bewaren mislukt.').slice(0, 300) });
  }
  revalidatePath('/admin/marketing/gtin');
  redirect(target);
}
