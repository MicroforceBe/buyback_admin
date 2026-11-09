import 'server-only';
// Loads the read-only Google Ads audit: every query on its own (one refused query never hides the rest),
// cached for an hour under the tag marketing-google.
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { adsSearch, googleSettings } from '@/lib/marketing/google';
import { ADS_QUERIES, adsCampaigns, adsConversionActions, adsDevices, adsProducts, adsSearchTerms } from '@/lib/marketing/googleAdsData';
import type { Result } from './googleLoad';

const settle = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: (e instanceof Error ? e.message : 'onbekende fout').slice(0, 300) }; } };

export const loadAds = cache(async () => {
  let settings: ReturnType<typeof googleSettings>;
  try { settings = googleSettings(); } catch (e) { return { settingsError: e instanceof Error ? e.message : 'Instellingen ongeldig.' } as const; }
  const { sa, ads } = settings;
  if (!sa || !ads) return null;
  const opts = { revalidate: 3600, tags: ['marketing-google'] };
  // Rows are parsed by the typed helpers below; never[] fits each helper's row type.
  const q = (name: keyof typeof ADS_QUERIES): Promise<never[]> => unstable_cache(() => adsSearch<never>(sa, ads, ADS_QUERIES[name]), ['mk-ads', name, ads, sa.clientEmail], opts)();
  const [campaigns, share, devices, terms, products, conversions] = await Promise.all([
    settle(() => q('campaigns')), settle(() => q('share')), settle(() => q('devices')),
    settle(() => q('searchTerms')), settle(() => q('products')), settle(() => q('conversions')),
  ]);
  return {
    customerId: ads,
    campaigns: campaigns?.ok ? { ok: true as const, data: adsCampaigns(campaigns.data, share?.ok ? share.data : []) } : campaigns,
    shareError: share && !share.ok ? share.error : null,
    devices: devices?.ok ? { ok: true as const, data: adsDevices(devices.data) } : devices,
    terms: terms?.ok ? { ok: true as const, data: adsSearchTerms(terms.data) } : terms,
    products: products?.ok ? { ok: true as const, data: adsProducts(products.data) } : products,
    conversions: conversions?.ok ? { ok: true as const, data: adsConversionActions(conversions.data) } : conversions,
  };
});
