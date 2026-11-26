// lib/leadRateLimit.ts
//
// Limiet op buyback-aanvragen per bezoeker (spam/bots). Bewaart alleen een hash van het IP-adres
// (SHA-256 met BUYBACK_PROXY_SECRET als zout), nooit het adres zelf. Tabel/functie: security/sql/buyback-lead-rate-limit.sql.
// - Het IP komt van de widget-proxy (nextjs-buyback) via x-buyback-client-ip, alleen geldig met het gedeelde geheim.
// - Rechtstreekse aanroepen gebruiken het eigen x-forwarded-for van Vercel.
// - Faalt de controle (tabel ontbreekt, database even weg), dan wordt de aanvraag NIET geblokkeerd (klant gaat voor).

export function clientKeySource(req: Request, secret: string | undefined): string | null {
  const viaProxy = req.headers.get('x-buyback-client-ip');
  const proof = req.headers.get('x-buyback-proxy-secret');
  if (viaProxy && secret && proof === secret) return viaProxy.trim() || null;
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || null;
}

export async function hashKey(ip: string, secret: string): Promise<string | null> {
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) return null;
  const data = new TextEncoder().encode(secret + '|' + ip);
  const buf = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** true = toegelaten, false = limiet bereikt. */
export async function leadAllowed(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> },
  req: Request,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  const secret = env.BUYBACK_PROXY_SECRET;
  if (!secret) return true; // nog niet ingesteld: geen limiet
  const ip = clientKeySource(req, secret);
  if (!ip) return true;
  const key = await hashKey(ip, secret);
  if (!key) return true;
  const max = Math.max(1, Number(env.BUYBACK_LEAD_LIMIT_PER_HOUR) || 10);
  try {
    const { data, error } = await supabase.rpc('buyback_lead_rate_hit', { p_key: key, p_max: max, p_window_seconds: 3600 });
    if (error) {
      console.warn('[LEAD_RATE_LIMIT] check unavailable');
      return true;
    }
    return data !== false;
  } catch {
    console.warn('[LEAD_RATE_LIMIT] check unavailable');
    return true;
  }
}

/** Testaanvraag: e-mailadres staat in BUYBACK_TEST_EMAILS (komma-lijst). */
export function isTestLead(email: unknown, env: Record<string, string | undefined>): boolean {
  if (typeof email !== 'string' || !email.trim()) return false;
  const lijst = (env.BUYBACK_TEST_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return lijst.includes(email.trim().toLowerCase());
}
