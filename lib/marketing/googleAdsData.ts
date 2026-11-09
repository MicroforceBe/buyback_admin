// Google Ads (pure): GAQL queries for the read-only audit and the parsing of googleAds:search rows into
// what the audit page shows. Amounts come in micros (1 EUR = 1,000,000).

export const ADS_API_VERSION = 'v26';

export const ADS_QUERIES = {
  campaigns: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros,
    metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'`,
  // Impression share only exists for Search and Shopping: asked separately so a refusal never hides the rest.
  share: `SELECT campaign.id, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
    FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' AND campaign.advertising_channel_type IN ('SEARCH', 'SHOPPING')`,
  devices: `SELECT segments.device, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE segments.date DURING LAST_30_DAYS`,
  // Rows are per ad group; they are summed per campaign + term before judging (a term that converts in one ad
  // group is no waste), and only then limited. Terms under EUR 1 per ad group are left out to bound the size.
  searchTerms: `SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.cost_micros > 1000000
    ORDER BY metrics.cost_micros DESC LIMIT 5000`,
  products: `SELECT segments.product_item_id, segments.product_title, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC LIMIT 25`,
  conversions: `SELECT conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category,
    conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status = 'ENABLED'`,
} as const;

type Num = string | number | undefined | null;
const n = (v: Num) => (v === undefined || v === null || v === '' ? 0 : Number(v));
const eur = (micros: Num) => Math.round(n(micros) / 10_000) / 100;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export type Totals = { cost: number; clicks: number; impressions: number; conversions: number; value: number; roas: number | null; cpa: number | null; convRate: number | null };
const totals = (cost: number, clicks: number, impressions: number, conversions: number, value: number): Totals =>
  ({ cost, clicks, impressions, conversions, value, roas: ratio(value, cost), cpa: ratio(cost, conversions), convRate: ratio(conversions, clicks) });

type Metrics = { costMicros?: Num; clicks?: Num; impressions?: Num; conversions?: Num; conversionsValue?: Num };
const fromMetrics = (m: Metrics = {}) => totals(eur(m.costMicros), n(m.clicks), n(m.impressions), n(m.conversions), n(m.conversionsValue));

export type AdsCampaign = Totals & {
  id: string; name: string; status: string; channel: string; dailyBudget: number;
  impressionShare: number | null; lostBudget: number | null; lostRank: number | null;
};

export function adsCampaigns(
  rows: { campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string }; campaignBudget?: { amountMicros?: Num }; metrics?: Metrics }[],
  share: { campaign?: { id?: string }; metrics?: { searchImpressionShare?: Num; searchBudgetLostImpressionShare?: Num; searchRankLostImpressionShare?: Num } }[] = [],
): AdsCampaign[] {
  const shareById = new Map(share.map(s => [String(s.campaign?.id ?? ''), s.metrics ?? {}]));
  const opt = (v: Num) => (v === undefined || v === null || v === '' ? null : Number(v));
  return rows.map(r => {
    const id = String(r.campaign?.id ?? '');
    const s = shareById.get(id);
    return {
      id, name: r.campaign?.name ?? '(zonder naam)', status: r.campaign?.status ?? '', channel: r.campaign?.advertisingChannelType ?? '',
      dailyBudget: eur(r.campaignBudget?.amountMicros), ...fromMetrics(r.metrics),
      impressionShare: s ? opt(s.searchImpressionShare) : null, lostBudget: s ? opt(s.searchBudgetLostImpressionShare) : null, lostRank: s ? opt(s.searchRankLostImpressionShare) : null,
    };
  }).sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
}

export function adsTotals(campaigns: Totals[]): Totals {
  const sum = (k: 'cost' | 'clicks' | 'impressions' | 'conversions' | 'value') => campaigns.reduce((t, c) => t + c[k], 0);
  return totals(Math.round(sum('cost') * 100) / 100, sum('clicks'), sum('impressions'), sum('conversions'), sum('value'));
}

const DEVICE_LABELS: Record<string, string> = { MOBILE: 'Mobiel', DESKTOP: 'Computer', TABLET: 'Tablet', CONNECTED_TV: 'Tv', OTHER: 'Overig' };

export function adsDevices(rows: { segments?: { device?: string }; metrics?: Metrics }[]): (Totals & { device: string; label: string })[] {
  const by = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number; value: number }>();
  for (const r of rows) {
    const d = r.segments?.device ?? 'OTHER';
    const t = fromMetrics(r.metrics);
    const cur = by.get(d) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
    by.set(d, { cost: cur.cost + t.cost, clicks: cur.clicks + t.clicks, impressions: cur.impressions + t.impressions, conversions: cur.conversions + t.conversions, value: cur.value + t.value });
  }
  return [...by].map(([device, t]) => ({ device, label: DEVICE_LABELS[device] ?? device, ...totals(Math.round(t.cost * 100) / 100, t.clicks, t.impressions, t.conversions, t.value) }))
    .filter(d => d.impressions > 0 || d.cost > 0).sort((a, b) => b.cost - a.cost);
}

export type SearchTerm = { term: string; campaign: string; cost: number; clicks: number; conversions: number };

/**
 * Search terms per campaign (summed over its ad groups) with at least EUR 5 cost; `waste` = those without any
 * conversion in that campaign, most expensive first, at most 50.
 */
export function adsSearchTerms(rows: { searchTermView?: { searchTerm?: string }; campaign?: { name?: string }; metrics?: Metrics }[]): { all: SearchTerm[]; waste: SearchTerm[] } {
  const by = new Map<string, SearchTerm>();
  for (const r of rows) {
    const term = r.searchTermView?.searchTerm ?? '';
    if (!term) continue;
    const campaign = r.campaign?.name ?? '';
    const key = `${campaign}\u0000${term}`;
    const cur = by.get(key) ?? { term, campaign, cost: 0, clicks: 0, conversions: 0 };
    by.set(key, { ...cur, cost: Math.round((cur.cost + eur(r.metrics?.costMicros)) * 100) / 100, clicks: cur.clicks + n(r.metrics?.clicks), conversions: cur.conversions + n(r.metrics?.conversions) });
  }
  const all = [...by.values()].filter(t => t.cost >= 5).sort((a, b) => b.cost - a.cost);
  return { all, waste: all.filter(t => t.conversions === 0).slice(0, 50) };
}

export function adsProducts(rows: { segments?: { productItemId?: string; productTitle?: string }; metrics?: Metrics }[]): (Totals & { offerId: string; title: string })[] {
  return rows.map(r => ({ offerId: r.segments?.productItemId ?? '', title: r.segments?.productTitle ?? '', ...fromMetrics(r.metrics) }));
}

export type ConversionAction = { name: string; type: string; category: string; primary: boolean };

export function adsConversionActions(rows: { conversionAction?: { name?: string; type?: string; category?: string; primaryForGoal?: boolean } }[]): ConversionAction[] {
  return rows.map(r => ({ name: r.conversionAction?.name ?? '', type: r.conversionAction?.type ?? '', category: r.conversionAction?.category ?? '', primary: r.conversionAction?.primaryForGoal === true }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/** The customer ID as Google Ads shows it (123-456-7890) or as digits; null when it is not 10 digits. */
export function adsCustomerId(raw: string | undefined | null): string | null {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}
