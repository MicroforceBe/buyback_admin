// Marketing overview (pure): SEO health from the stored catalogue and collection reports, the actions
// that matter most, and which marketing sources are connected (by the presence of their settings only).
import { ISSUE_GROUPS, ISSUE_LABELS, type CatalogIssue, type IssueCode } from '@/lib/shopify/catalog';
import { COLLECTION_ISSUE_LABELS, type CollectionIssueCode } from '@/lib/shopify/collections';

export type StoredReport<C extends string> = { id: string; created_at: string; checked: number; counts: Partial<Record<C, number>> };

/** The findability checks shown on the overview, in this order. */
export const PRODUCT_METRICS: IssueCode[] = ['seo_title_missing', 'seo_description_missing', 'seo_raw', 'description_empty', 'description_script', 'description_empty_image', 'description_h1', 'alt_missing', 'alt_weak', 'description_alt_missing'];
export const COLLECTION_METRICS: CollectionIssueCode[] = ['col_seo_title_missing', 'col_seo_description_missing', 'col_description_empty', 'col_h1', 'col_internal', 'col_script'];

export type Metric = { code: string; label: string; now: number; delta: number | null; trend: number[] };

/**
 * Per check: the count in the newest report, the change since the report before it, and the counts of
 * all stored reports from old to new (for a small trend). Reports are given newest first.
 */
export function metrics<C extends string>(reports: StoredReport<C>[], codes: C[], labels: Record<C, string>): Metric[] {
  const [latest, previous] = reports;
  return codes.map(code => ({
    code, label: labels[code],
    now: latest?.counts[code] ?? 0,
    delta: latest && previous && previous.counts[code] !== undefined ? (latest.counts[code] ?? 0) - (previous.counts[code] ?? 0) : null,
    trend: [...reports].reverse().map(r => r.counts[code] ?? 0),
  }));
}

const SEO_CODES = new Set<IssueCode>(ISSUE_GROUPS.find(g => g.label.startsWith('Vindbaarheid'))?.codes ?? []);

/**
 * Share of checked products without any findability issue, and how many products in stock (what
 * customers see) still have one. Null when there is no report.
 */
export function seoScore(report: { checked: number; issues: CatalogIssue[] } | null): { score: number; inStockWithIssues: number } | null {
  if (!report || !report.checked) return null;
  const withIssue = report.issues.filter(i => i.issues.some(c => SEO_CODES.has(c)));
  return { score: Math.round(100 * (1 - withIssue.length / report.checked)), inStockWithIssues: withIssue.filter(i => i.stock > 0).length };
}

export type Action = { code: IssueCode; label: string; inStock: number; fixable: number };

/**
 * What to do first: findability issues on products in stock (customers see those), most products first,
 * with how many have a proposal the tool can apply.
 */
export function topActions(issues: CatalogIssue[], limit = 5): Action[] {
  const by = new Map<IssueCode, Action>();
  for (const i of issues) {
    if (i.stock <= 0) continue;
    for (const c of i.issues) {
      if (!SEO_CODES.has(c)) continue;
      const a = by.get(c) ?? { code: c, label: ISSUE_LABELS[c], inStock: 0, fixable: 0 };
      a.inStock++;
      if (i.fixes.length) a.fixable++;
      by.set(c, a);
    }
  }
  return [...by.values()].sort((a, b) => b.inStock - a.inStock || a.label.localeCompare(b.label)).slice(0, limit);
}

export type Source = { key: string; name: string; group: 'Google' | 'Advertenties' | 'E-mail' | 'Reputatie'; shows: string; settings: string[]; phase: string };

/** The marketing sources of the overview and the settings (environment variables) each one needs. */
export const SOURCES: Source[] = [
  { key: 'search_console', name: 'Google Search Console', group: 'Google', shows: 'Klikken, vertoningen, positie, top-zoektermen en indexering', settings: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL'], phase: '1b' },
  { key: 'analytics', name: 'Google Analytics 4', group: 'Google', shows: 'Bezoekers per kanaal en conversie', settings: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GA4_PROPERTY_ID'], phase: '1b' },
  { key: 'merchant_center', name: 'Google Merchant Center', group: 'Google', shows: 'Goedgekeurde en afgekeurde producten, met de reden', settings: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'MERCHANT_CENTER_ID'], phase: '1b' },
  { key: 'google_ads', name: 'Google Ads', group: 'Advertenties', shows: 'Uitgaven, opbrengst en kost per verkoop per campagne', settings: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_REFRESH_TOKEN'], phase: '1d' },
  { key: 'meta_ads', name: 'Meta Ads (Facebook/Instagram)', group: 'Advertenties', shows: 'Uitgaven, bereik en opbrengst per campagne', settings: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'], phase: '1d' },
  { key: 'mailchimp', name: 'Mailchimp', group: 'E-mail', shows: 'Lijstgrootte, open- en klikratio, resultaat per campagne', settings: ['MAILCHIMP_API_KEY'], phase: '1c' },
  { key: 'trustpilot', name: 'Trustpilot', group: 'Reputatie', shows: 'Score, aantal reviews, reviews zonder antwoord', settings: ['TRUSTPILOT_API_KEY', 'TRUSTPILOT_BUSINESS_UNIT_ID'], phase: '1c' },
  { key: 'judgeme', name: 'Judge.me', group: 'Reputatie', shows: 'Productreviews: score, aantal, nieuwe reviews', settings: ['JUDGEME_API_TOKEN'], phase: '1c' },
];

/** Connected = every setting is present. Only presence is checked: values are never read or shown. */
export function sourceStatus(env: Record<string, string | undefined>): { source: Source; connected: boolean; missing: string[] }[] {
  return SOURCES.map(source => {
    const missing = source.settings.filter(k => !(env[k] ?? '').trim());
    return { source, connected: !missing.length, missing };
  });
}

export const COLLECTION_LABELS = COLLECTION_ISSUE_LABELS;
