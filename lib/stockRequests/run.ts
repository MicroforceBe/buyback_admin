import 'server-only';
// Cron (elk uur): open verwittigingen "Op aanvraag" vergelijken met de voorraad in Shopify en de klant mailen zodra een
// gevraagde MacBook-configuratie in een van de gekozen staten actief en op voorraad is. Eén mail per e-mailadres per run.
// Een rij wordt eerst op "notified" gezet (alleen als ze nog open is) en pas dan gemaild: liever eens geen mail dan twee.
// Mislukt de mail, dan gaat de rij terug naar "open" en probeert de volgende run opnieuw.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig } from '@/lib/shopify/client';
import { adminBaseUrl, availableMail, groupByEmail, matchRequests, unsubscribeUrl, type OpenRequest, type ShopProduct } from './core';
import { sendShopMail } from './mail';

const MAX_MAILS = 50;

const COLLECTION_QUERY = `query StockRequestCollection($handle: String!) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    products(first: 250) { nodes { handle status totalInventory priceRangeV2 { minVariantPrice { amount } } } }
  }
}`;
type Raw = { collectionByIdentifier: { products: { nodes: { handle: string; status: string; totalInventory: number | null; priceRangeV2?: { minVariantPrice?: { amount?: string } } }[] } } | null };

export type RunResult = { open: number; matched: number; mailed: number; failed: number; expired: number; skipped?: string };

export async function runStockRequests(): Promise<RunResult> {
  const now = new Date().toISOString();
  const { data: exp } = await supabaseAdmin.from('shop_stock_requests').update({ status: 'expired', updated_at: now }).eq('status', 'open').lt('expires_at', now).select('id');
  // IP-hash alleen bewaren zolang hij nodig is voor de begrenzing.
  await supabaseAdmin.from('shop_stock_requests').update({ ip_hash: null }).not('ip_hash', 'is', null).lt('created_at', new Date(Date.now() - 2 * 86400_000).toISOString());
  const { data, error } = await supabaseAdmin.from('shop_stock_requests')
    .select('id,name,email,language,collection_handle,config_key,config_label,grades,token')
    .eq('status', 'open').order('created_at', { ascending: true }).limit(2000);
  if (error) throw new Error('Aanvragen lezen mislukt.');
  const open = (data ?? []) as OpenRequest[];
  const result: RunResult = { open: open.length, matched: 0, mailed: 0, failed: 0, expired: exp?.length ?? 0 };
  if (!open.length) return result;
  const config = shopifyConfig();
  if (!config) return { ...result, skipped: 'shopify' };
  const client = createShopifyClient(config);
  const products = new Map<string, ShopProduct[]>();
  for (const handle of new Set(open.map(r => r.collection_handle))) {
    const raw = await client.graphql<Raw>(COLLECTION_QUERY, { handle });
    products.set(handle, (raw.collectionByIdentifier?.products.nodes ?? []).map(n => ({
      handle: n.handle, status: n.status, totalInventory: n.totalInventory,
      price: n.priceRangeV2?.minVariantPrice?.amount ? Number(n.priceRangeV2.minVariantPrice.amount) : null,
    })));
  }
  const matches = matchRequests(open, products);
  result.matched = matches.length;
  const base = adminBaseUrl(process.env);
  for (const group of groupByEmail(matches).values()) {
    if (result.mailed + result.failed >= MAX_MAILS) break;
    const ids = group.map(m => m.request.id);
    const stamp = new Date().toISOString();
    const { data: claimed } = await supabaseAdmin.from('shop_stock_requests')
      .update({ status: 'notified', notified_at: stamp, updated_at: stamp }).in('id', ids).eq('status', 'open').select('id');
    const claimedIds = new Set((claimed ?? []).map(r => r.id as string));
    const mine = group.filter(m => claimedIds.has(m.request.id));
    if (!mine.length) continue;
    for (const m of mine) await supabaseAdmin.from('shop_stock_requests').update({ notified_handle: m.product.handle }).eq('id', m.request.id);
    const last = mine[mine.length - 1].request;
    try {
      await sendShopMail(last.email, availableMail(last.language, last.name, mine, unsubscribeUrl(base, last.token, last.language)), unsubscribeUrl(base, last.token, last.language));
      result.mailed++;
    } catch {
      await supabaseAdmin.from('shop_stock_requests').update({ status: 'open', notified_at: null, notified_handle: null }).in('id', [...claimedIds]).eq('status', 'notified');
      result.failed++;
    }
  }
  return result;
}
