import 'server-only';
// Loads the Google sources for the marketing page once per request; each source is cached for an hour
// (failures are not cached) and fails on its own.
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { analytics, googleSettings, merchantCenter, searchConsole } from '@/lib/marketing/google';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string } | null;
const settle = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: (e instanceof Error ? e.message : 'onbekende fout').slice(0, 300) }; } };

export const loadGoogle = cache(async () => {
  let settings: ReturnType<typeof googleSettings>;
  try { settings = googleSettings(); } catch (e) { return { settingsError: e instanceof Error ? e.message : 'Instellingen ongeldig.' } as const; }
  const { sa, site, ga4, merchant } = settings;
  if (!sa) return null;
  const opts = { revalidate: 3600, tags: ['marketing-google'] };
  const [gsc, ga, mc] = await Promise.all([
    site ? settle(unstable_cache(() => searchConsole(sa, site), ['mk-gsc', site, sa.clientEmail], opts)) : Promise.resolve(null),
    ga4 ? settle(unstable_cache(() => analytics(sa, ga4), ['mk-ga4', ga4, sa.clientEmail], opts)) : Promise.resolve(null),
    // v2: the summary now carries the disapproved products, so older cached entries are not reused.
    merchant ? settle(unstable_cache(() => merchantCenter(sa, merchant), ['mk-mc-v2', merchant, sa.clientEmail], opts)) : Promise.resolve(null),
  ]);
  return { serviceAccount: sa.clientEmail, gsc, ga, mc };
});
