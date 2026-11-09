import 'server-only';
// Runs the model-GTIN barcodes step (see modelBarcodes.ts) with the Shopify sync's own switch: off = nothing,
// shadow = only count, live = write. Hourly cron and the button on Marketing → Modellen & GTIN.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig } from '@/lib/shopify/client';
import { loadModelGtins, syncModelBarcodes, type BarcodeResult } from '@/lib/shopify/modelBarcodes';

export async function runModelBarcodes(): Promise<BarcodeResult> {
  const { data: settings, error } = await supabaseAdmin.from('shopify_sync_settings').select('mode').eq('id', true).maybeSingle();
  if (error || !settings) throw new Error('Shopify-instellingen konden niet worden geladen.');
  if (settings.mode === 'off') return { status: 'skipped', reason: 'Shopify-sync staat uit' };
  const cfg = shopifyConfig();
  if (!cfg) return { status: 'skipped', reason: 'Shopify niet geconfigureerd' };
  const gtins = await loadModelGtins(supabaseAdmin);
  return syncModelBarcodes(createShopifyClient(cfg), gtins, { dryRun: settings.mode !== 'live' });
}
