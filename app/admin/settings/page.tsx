// app/admin/settings/page.tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === Server Actions =========================================================
async function getBranding() {
  const { data, error } = await supabaseAdmin
    .from('buyback_settings')
    .select('value')
    .eq('key', 'branding')
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('[SETTINGS] load branding error:', error);
  }
  const v = (data?.value ?? {}) as any;
  return {
    brand_name: v.brand_name ?? 'Microforce Buyback',
    primary_color: v.primary_color ?? '#0ea5e9',
    email_from: v.email_from ?? '',
    email_reply_to: v.email_reply_to ?? '',
    email_disclaimer: v.email_disclaimer ?? '',
    logo_url: v.logo_url ?? '',
  };
}

// Upload + save action
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function actionSaveBranding(formData: FormData) {
  'use server';
  const brand_name = (formData.get('brand_name') as string || '').trim();
  const primary_color = (formData.get('primary_color') as string || '').trim() || '#0ea5e9';
  const email_from = (formData.get('email_from') as string || '').trim();
  const email_reply_to = (formData.get('email_reply_to') as string || '').trim();
  const email_disclaimer = (formData.get('email_disclaimer') as string || '').trim();
  const current_logo_url = (formData.get('current_logo_url') as string || '').trim();

  // Optional file
  const file = formData.get('logo_file') as File | null;

  let logo_url = current_logo_url;

  if (file && file.size > 0) {
    // Upload naar Supabase Storage (bucket: branding)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `logo.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: up, error: upErr } = await supabaseAdmin
      .storage
      .from('branding')
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type || 'image/png',
      });

    if (upErr) {
      console.error('[SETTINGS] logo upload error:', upErr);
      throw new Error('Upload van logo mislukt');
    }

    // Publieke URL (stel bucket public in óf maak een signed URL)
    const { data: pub } = supabaseAdmin.storage.from('branding').getPublicUrl(path);
    logo_url = pub.publicUrl;
  }

  // Bewaar in buyback_settings
  const payload = {
    brand_name,
    primary_color,
    email_from,
    email_reply_to,
    email_disclaimer,
    logo_url,
  };

  const { error: upsertErr } = await supabaseAdmin
    .from('buyback_settings')
    .upsert({ key: 'branding', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (upsertErr) {
    console.error('[SETTINGS] upsert error:', upsertErr);
    throw new Error('Bewaren van settings mislukt');
  }

  // Terug naar settings (blijven op dezelfde pagina)
  redirect('/admin/settings?tab=branding&saved=1');
}

// ============================================================================

function TabLink({ tab, active, children }: { tab: string; active: boolean; children: React.ReactNode }) {
  const cls = [
    'inline-flex items-center h-9 px-3 text-sm rounded border transition-colors',
    active ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-white',
  ].join(' ');
  return <Link href={`/admin/settings?tab=${tab}`} className={cls}>{children}</Link>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Record<string,string|undefined> }) {
  const tab = (searchParams.tab || 'branding') as 'branding'|'shops';
  const saved = searchParams.saved === '1';
  const branding = await getBranding();

  return (
    <div className="w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabLink tab="branding" active={tab==='branding'}>Branding & e-mail</TabLink>
        <TabLink tab="shops" active={tab==='shops'}>Winkels</TabLink>
      </div>

      {saved && (
        <div className="p-3 border rounded bg-green-50 text-green-800 text-sm">
          Instellingen bewaard.
        </div>
      )}

      {/* Content per tab */}
      {tab === 'branding' ? (
        <section className="bg-white border rounded p-4 space-y-4">
          <h2 className="text-lg font-semibold">Branding & e-mail</h2>

          <form action={actionSaveBranding} className="grid gap-4 max-w-2xl">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium mb-1">Logo (PNG/JPG/SVG)</label>
              {branding.logo_url ? (
                <div className="mb-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={branding.logo_url} alt="Huidig logo" className="h-10 w-auto border rounded bg-white" />
                  <span className="text-xs text-gray-500 break-all">{branding.logo_url}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-2">Nog geen logo geüpload.</p>
              )}
              <input type="file" name="logo_file" accept="image/*" className="bb-input" />
              <input type="hidden" name="current_logo_url" defaultValue={branding.logo_url} />
              <p className="text-xs text-gray-500 mt-1">Tip: gebruik een transparante PNG voor beste resultaat.</p>
            </div>

            {/* Brand name */}
            <div>
              <label className="block text-sm font-medium mb-1">Merknaam</label>
              <input name="brand_name" defaultValue={branding.brand_name} className="bb-input w-full h-9 px-2 text-sm" />
            </div>

            {/* Primary color */}
            <div>
              <label className="block text-sm font-medium mb-1">Primaire kleur</label>
              <input type="color" name="primary_color" defaultValue={branding.primary_color} className="h-9 w-20 p-1 border rounded" />
            </div>

            {/* Email from */}
            <div>
              <label className="block text-sm font-medium mb-1">E-mail afzender (From)</label>
              <input
                name="email_from"
                defaultValue={branding.email_from}
                placeholder="Bijv. Microforce Buyback <klantenservice@microforce.be>"
                className="bb-input w-full h-9 px-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Moet overeenkomen met je geverifieerde afzender/domein in Resend.
              </p>
            </div>

            {/* Email reply-to */}
            <div>
              <label className="block text-sm font-medium mb-1">E-mail Reply-To (optioneel)</label>
              <input
                name="email_reply_to"
                defaultValue={branding.email_reply_to}
                placeholder="bv. support@microforce.be"
                className="bb-input w-full h-9 px-2 text-sm"
              />
            </div>

            {/* Disclaimer */}
            <div>
              <label className="block text-sm font-medium mb-1">E-mail disclaimer (onderaan elke mail)</label>
              <textarea
                name="email_disclaimer"
                defaultValue={branding.email_disclaimer}
                rows={5}
                className="bb-input w-full px-2 py-2 text-sm"
                placeholder="Voeg hier je juridische disclaimer of privacyverwijzing toe…"
              />
            </div>

            <div className="flex gap-2">
              <button className="bb-btn primary h-9 px-3 text-sm" type="submit">Bewaren</button>
              <Link href="/admin" className="bb-btn h-9 px-3 text-sm">Annuleer</Link>
            </div>
          </form>

          <hr className="my-4" />

          <div className="text-xs text-gray-500">
            Deze waarden worden weggeschreven naar <code>buyback_settings</code> (key:&nbsp;
            <code>branding</code>) en gebruikt door je mail-templates (o.a. <code>sendStatusMail</code>). Het logo
            wordt opgeslagen in Supabase Storage bucket <code>branding</code>.
          </div>
        </section>
      ) : (
        <section className="bg-white border rounded p-4 space-y-3">
          <h2 className="text-lg font-semibold">Winkels</h2>
          <p className="text-sm text-gray-600">
            Beheer je winkels, adressen en openingsuren. Deze gegevens worden o.a. gebruikt in de bevestigingsmails.
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Pas de URL aan naar jouw bestaande shop settings route: */}
            <Link href="/admin/settings/shop" className="bb-btn h-9 px-3 text-sm">Open winkelbeheer</Link>
          </div>
        </section>
      )}
    </div>
  );
}
