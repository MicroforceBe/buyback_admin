// Verwittigingen "Op aanvraag" op de MacBook-modelpagina's van microforce.be: pure functies (configuratie uit de handle,
// invoer controleren, matchen met voorraad, mailteksten in het Nederlands, Frans en Engels). Geen netwerk of database.
// Gebruikt door app/api/public/aanvraag (aanvragen), lib/stockRequests/run.ts (cron) en de overzichtspagina.
import { parseHandle } from '@/lib/shopify/soldOut';

export type Lang = 'nl' | 'fr' | 'en';
export const LANGS: Lang[] = ['nl', 'fr', 'en'];
export const SHOP = 'https://microforce.be';
export const MAX_CONFIGS = 12;

/**
 * Configuratie van een MacBook uit de handle: "M2/16GB/1TB", "M1 Pro/16GB/512GB", of '' als het geen MacBook is of
 * de configuratie niet te lezen is. Zelfde ontleding als macCfg in de theme (snippets/model-verwittig.liquid en
 * snippets/model-op-aanvraag.liquid): eerste getal met GB = werkgeheugen ("16gb" of "16-gb"), opslag = volgende GB/TB of
 * het deel voor "ssd" ("512ssd", "1tbssd", "1-tb-ssd").
 */
export function macConfig(handle: string): string {
  const w = String(handle || '').toLowerCase().split('-');
  if (w[0] !== 'macbook') return '';
  let chip = '', ram = 0, ssd = '', p1 = '', p2 = '';
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    if (!chip && /^m[1-9]$/.test(x)) { chip = x.toUpperCase(); if (w[i + 1] === 'pro') chip += ' Pro'; else if (w[i + 1] === 'max') chip += ' Max'; }
    if (ram && !ssd && /^\d+(gb|tb)$/.test(x) && parseInt(x, 10) > 0) ssd = parseInt(x, 10) + (/tb$/.test(x) ? 'TB' : 'GB');
    if (!ram) { if (x === 'gb') ram = parseInt(p1, 10) || 0; else if (/^\d+gb$/.test(x)) ram = parseInt(x, 10); }
    if (!ssd && x.includes('ssd')) {
      let pre = x.split('ssd')[0];
      if (!pre) { pre = p1; if (pre === 'tb' || pre === 'gb') pre = p2 + p1; }
      const n = parseInt(pre, 10) || 0;
      ssd = n ? n + (pre.includes('tb') ? 'TB' : 'GB') : '';
    }
    p2 = p1; p1 = x;
  }
  return chip && ram && ssd ? `${chip}/${ram}GB/${ssd}` : '';
}

export const CONFIG_KEY = /^M[1-9]( Pro| Max)?\/[0-9]{1,3}GB\/[0-9]{1,4}(GB|TB)$/;

/** Leesbare naam van een configuratie in de taal van de klant: "M2 · 16 GB werkgeheugen · 1 TB opslag". */
export function configLabel(key: string, lang: Lang): string {
  const [chip, ram, ssd] = key.split('/');
  const unit = (v: string) => { const m = /^(\d+)(GB|TB)$/.exec(v); if (!m) return v; return lang === 'fr' ? `${m[1]} ${m[2] === 'TB' ? 'To' : 'Go'}` : `${m[1]} ${m[2]}`; };
  const t = TEXT[lang];
  return `${chip} · ${unit(ram)} ${t.ram} · ${unit(ssd)} ${t.ssd}`;
}

export type RequestInput = { name: string; email: string; language: Lang; collection: string; keys: string[]; grades: number[] };
export type ParseResult = { ok: true; value: RequestInput } | { ok: false; error: 'invalid' | 'consent' } | { ok: false; error: 'spam' };

/** Controleert de body van POST /api/public/aanvraag. Het veld "website" is een val voor bots (moet leeg zijn). */
export function parseRequest(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' };
  const b = body as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim() !== '') return { ok: false, error: 'spam' };
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const language: Lang = LANGS.includes(b.language as Lang) ? (b.language as Lang) : 'nl';
  const collection = typeof b.collection === 'string' ? b.collection.trim().toLowerCase() : '';
  if (b.grades !== undefined && !Array.isArray(b.grades)) return { ok: false, error: 'invalid' };
  const grades = Array.isArray(b.grades) ? [...new Set(b.grades.map(Number))].sort() : [3, 4, 5];
  const keys = Array.isArray(b.configs) ? [...new Set(b.configs.filter((k): k is string => typeof k === 'string').map(k => k.trim()))] : [];
  if (!name || name.length > 100 || /[\r\n<>]/.test(name)) return { ok: false, error: 'invalid' };
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { ok: false, error: 'invalid' };
  if (!/^refurbished-macbook-[a-z0-9-]{1,80}$/.test(collection)) return { ok: false, error: 'invalid' };
  if (!grades.length || !grades.every(g => g === 3 || g === 4 || g === 5)) return { ok: false, error: 'invalid' };
  if (!keys.length || keys.length > MAX_CONFIGS || !keys.every(k => CONFIG_KEY.test(k))) return { ok: false, error: 'invalid' };
  if (b.consent !== true) return { ok: false, error: 'consent' };
  return { ok: true, value: { name, email, language, collection, keys, grades } };
}

export type OpenRequest = { id: string; name: string; email: string; language: Lang; collection_handle: string; config_key: string; config_label: string; grades: number[]; token: string };
export type ShopProduct = { handle: string; status: string; totalInventory: number | null; price: number | null };
export type Match = { request: OpenRequest; product: { handle: string; grade: number; price: number | null } };

/** Per open aanvraag het goedkoopste actieve toestel op voorraad met die configuratie in een van de gekozen staten. */
export function matchRequests(requests: OpenRequest[], productsByCollection: Map<string, ShopProduct[]>): Match[] {
  const out: Match[] = [];
  for (const r of requests) {
    let best: Match['product'] | null = null;
    for (const p of productsByCollection.get(r.collection_handle) ?? []) {
      if (p.status !== 'ACTIVE' || (p.totalInventory ?? 0) <= 0 || macConfig(p.handle) !== r.config_key) continue;
      const grade = Number(parseHandle(p.handle)?.grade ?? 0);
      if (!r.grades.includes(grade)) continue;
      if (!best || (p.price ?? Infinity) < (best.price ?? Infinity)) best = { handle: p.handle, grade, price: p.price };
    }
    if (best) out.push({ request: r, product: best });
  }
  return out;
}

/** Eén mail per e-mailadres: de matches gegroepeerd op e-mail (taal en naam van de laatste aanvraag). */
export function groupByEmail(matches: Match[]): Map<string, Match[]> {
  const g = new Map<string, Match[]>();
  for (const m of matches) { const k = m.request.email.toLowerCase(); g.set(k, [...(g.get(k) ?? []), m]); }
  return g;
}

export function productUrl(handle: string, lang: Lang): string {
  return `${SHOP}${lang === 'nl' ? '' : '/' + lang}/products/${encodeURIComponent(handle)}`;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function money(n: number | null, lang: Lang): string {
  if (n === null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat(lang === 'en' ? 'en-IE' : lang === 'fr' ? 'fr-BE' : 'nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
}

export const GRADE: Record<Lang, Record<number, string>> = {
  nl: { 3: 'Behoorlijk', 4: 'Zeer goed', 5: 'Als nieuw' },
  fr: { 3: 'Correct', 4: 'Très bon', 5: 'Comme neuf' },
  en: { 3: 'Fair', 4: 'Very good', 5: 'Like new' },
};

/** Gekozen staten als tekst: "Behoorlijk of Zeer goed"; alle drie = null (elke staat is goed). */
export function gradesLabel(grades: number[], lang: Lang): string | null {
  const g = [...new Set(grades)].filter(x => GRADE[lang][x]).sort();
  if (!g.length || g.length === 3) return null;
  const or = lang === 'fr' ? ' ou ' : lang === 'en' ? ' or ' : ' of ';
  return g.map(x => GRADE[lang][x]).join(or);
}

export const TEXT = {
  nl: {
    ram: 'werkgeheugen', ssd: 'opslag', hi: (n: string) => `Hallo ${n},`,
    confirmSubject: 'Je verwittiging bij Microforce is genoteerd',
    confirmIntro: 'Bedankt! We sturen je een mail zodra een van deze MacBooks terug op voorraad is:',
    gradeLine: (g: string) => `Staat: ${g}.`, anyGrade: 'Elke staat is goed.',
    confirmOutro: 'Je aanvraag blijft 6 maanden geldig. We gebruiken je gegevens alleen hiervoor.',
    availSubject: 'Je MacBook is terug op voorraad bij Microforce',
    availIntro: 'Goed nieuws: een MacBook waarvoor je een verwittiging vroeg, is terug op voorraad.',
    view: 'Bekijk het toestel', grade: 'Staat', availOutro: 'Op = op: refurbished toestellen zijn uniek. Wil je hem zeker? Bestel online of kom langs in Gentbrugge, Antwerpen of Oudenaarde.',
    unsub: 'Geen interesse meer? Schrijf je uit', sign: 'Micro Mike en het team van Microforce',
    pageTitle: 'Verwittiging stopzetten', pageAsk: 'Wil je geen mail meer krijgen voor deze aanvraag?', pageBtn: 'Uitschrijven',
    pageDone: 'Je bent uitgeschreven. Je krijgt voor deze aanvraag geen mail meer.', pageGone: 'Deze aanvraag is al afgesloten of bestaat niet meer.', back: 'Naar microforce.be',
  },
  fr: {
    ram: 'mémoire', ssd: 'stockage', hi: (n: string) => `Bonjour ${n},`,
    confirmSubject: 'Votre alerte chez Microforce est enregistrée',
    confirmIntro: 'Merci ! Nous vous enverrons un e-mail dès qu’un de ces MacBook est de nouveau en stock :',
    gradeLine: (g: string) => `État : ${g}.`, anyGrade: 'Tous les états conviennent.',
    confirmOutro: 'Votre demande reste valable 6 mois. Nous utilisons vos données uniquement à cette fin.',
    availSubject: 'Votre MacBook est de nouveau en stock chez Microforce',
    availIntro: 'Bonne nouvelle : un MacBook pour lequel vous avez demandé une alerte est de nouveau en stock.',
    view: 'Voir l’appareil', grade: 'État', availOutro: 'Chaque appareil reconditionné est unique. Vous le voulez ? Commandez en ligne ou passez à Gentbrugge, Anvers ou Audenarde.',
    unsub: 'Plus intéressé ? Se désinscrire', sign: 'Micro Mike et l’équipe Microforce',
    pageTitle: 'Arrêter l’alerte', pageAsk: 'Vous ne souhaitez plus recevoir d’e-mail pour cette demande ?', pageBtn: 'Se désinscrire',
    pageDone: 'Vous êtes désinscrit. Vous ne recevrez plus d’e-mail pour cette demande.', pageGone: 'Cette demande est déjà clôturée ou n’existe plus.', back: 'Vers microforce.be',
  },
  en: {
    ram: 'memory', ssd: 'storage', hi: (n: string) => `Hi ${n},`,
    confirmSubject: 'Your Microforce stock alert is set',
    confirmIntro: 'Thank you! We will email you as soon as one of these MacBooks is back in stock:',
    gradeLine: (g: string) => `Condition: ${g}.`, anyGrade: 'Any condition is fine.',
    confirmOutro: 'Your request stays valid for 6 months. We only use your details for this.',
    availSubject: 'Your MacBook is back in stock at Microforce',
    availIntro: 'Good news: a MacBook you asked us to notify you about is back in stock.',
    view: 'View the device', grade: 'Condition', availOutro: 'Every refurbished device is unique. Want it? Order online or visit us in Gentbrugge, Antwerp or Oudenaarde.',
    unsub: 'No longer interested? Unsubscribe', sign: 'Micro Mike and the Microforce team',
    pageTitle: 'Stop alert', pageAsk: 'Do you no longer want emails for this request?', pageBtn: 'Unsubscribe',
    pageDone: 'You are unsubscribed. You will no longer receive emails for this request.', pageGone: 'This request is already closed or no longer exists.', back: 'Go to microforce.be',
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type Mail = { subject: string; html: string; text: string };

function frame(lang: Lang, body: string, unsubscribeUrl: string): string {
  const t = TEXT[lang];
  return `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#14222f">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e3e9f0">`
    + `<div style="font-size:22px;font-weight:800;color:#1080cf;margin-bottom:18px">microforce</div>${body}`
    + `<p style="margin:22px 0 0;font-size:14px;color:#3c4752">${escapeHtml(t.sign)}</p></div>`
    + `<p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#7a8590;text-align:center"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#7a8590">${escapeHtml(t.unsub)}</a></p>`
    + `</body></html>`;
}

/** Bevestiging na het aanvragen. */
export function confirmationMail(lang: Lang, name: string, keys: string[], grades: number[], unsubscribeUrl: string): Mail {
  const t = TEXT[lang];
  const labels = keys.map(k => configLabel(k, lang));
  const gl = gradesLabel(grades, lang);
  const grade = gl ? t.gradeLine(gl) : t.anyGrade;
  const html = frame(lang, `<p style="margin:0 0 12px">${escapeHtml(t.hi(name))}</p><p style="margin:0 0 10px">${escapeHtml(t.confirmIntro)}</p>`
    + `<ul style="margin:0 0 12px;padding-left:20px">${labels.map(l => `<li style="margin:4px 0"><strong>${escapeHtml(l)}</strong></li>`).join('')}</ul>`
    + `<p style="margin:0 0 10px">${escapeHtml(grade)}</p><p style="margin:0;font-size:13px;color:#5b6470">${escapeHtml(t.confirmOutro)}</p>`, unsubscribeUrl);
  const text = [t.hi(name), '', t.confirmIntro, ...labels.map(l => '- ' + l), '', grade, t.confirmOutro, '', t.sign, '', `${t.unsub}: ${unsubscribeUrl}`].join('\n');
  return { subject: t.confirmSubject, html, text };
}

/** Mail zodra een gevraagde configuratie op voorraad is (alle matches van één e-mailadres samen). */
export function availableMail(lang: Lang, name: string, matches: Match[], unsubscribeUrl: string): Mail {
  const t = TEXT[lang];
  const rows = matches.map(m => ({ label: configLabel(m.request.config_key, lang), url: productUrl(m.product.handle, lang), grade: GRADE[lang][m.product.grade] ?? '', price: money(m.product.price, lang) }));
  const html = frame(lang, `<p style="margin:0 0 12px">${escapeHtml(t.hi(name))}</p><p style="margin:0 0 14px">${escapeHtml(t.availIntro)}</p>`
    + rows.map(r => `<div style="margin:0 0 12px;padding:14px 16px;border:1px solid #e3e9f0;border-radius:12px"><div style="font-weight:700">${escapeHtml(r.label)}</div>`
      + `<div style="margin:4px 0 10px;font-size:14px;color:#3c4752">${escapeHtml(t.grade)}: ${escapeHtml(r.grade)}${r.price ? ` · <strong style="color:#1080cf">${escapeHtml(r.price)}</strong>` : ''}</div>`
      + `<a href="${escapeHtml(r.url)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1080cf;color:#fff;font-weight:700;text-decoration:none">${escapeHtml(t.view)}</a></div>`).join('')
    + `<p style="margin:0;font-size:13px;color:#5b6470">${escapeHtml(t.availOutro)}</p>`, unsubscribeUrl);
  const text = [t.hi(name), '', t.availIntro, '', ...rows.flatMap(r => [`${r.label} (${t.grade}: ${r.grade}${r.price ? ', ' + r.price : ''})`, r.url, '']), t.availOutro, '', t.sign, '', `${t.unsub}: ${unsubscribeUrl}`].join('\n');
  return { subject: t.availSubject, html, text };
}

/** Eenvoudige pagina voor uitschrijven (GET toont een knop, zodat mailscanners niemand uitschrijven). */
export function unsubscribePage(lang: Lang, state: 'ask' | 'done' | 'gone', token: string): string {
  const t = TEXT[lang];
  const body = state === 'ask'
    ? `<p>${escapeHtml(t.pageAsk)}</p><form method="post"><input type="hidden" name="t" value="${escapeHtml(token)}"><input type="hidden" name="l" value="${lang}">`
      + `<button type="submit" style="padding:12px 22px;border:0;border-radius:999px;background:#1080cf;color:#fff;font-weight:700;font-size:15px;cursor:pointer">${escapeHtml(t.pageBtn)}</button></form>`
    : `<p>${escapeHtml(state === 'done' ? t.pageDone : t.pageGone)}</p>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
    + `<title>${escapeHtml(t.pageTitle)} – Microforce</title></head><body style="margin:0;padding:40px 16px;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#14222f">`
    + `<main style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e3e9f0;border-radius:16px;padding:28px"><div style="font-size:22px;font-weight:800;color:#1080cf;margin-bottom:14px">microforce</div>`
    + `<h1 style="font-size:20px;margin:0 0 10px">${escapeHtml(t.pageTitle)}</h1>${body}<p style="margin-top:20px"><a href="${SHOP}${lang === 'nl' ? '' : '/' + lang}" style="color:#1080cf">${escapeHtml(t.back)}</a></p></main></body></html>`;
}

/** Publieke basis-URL van buyback-admin (voor de uitschrijflink). */
export function adminBaseUrl(env: Record<string, string | undefined>): string {
  // Op een preview (testomgeving) wijst de link naar die branch, anders naar het productiedomein.
  const host = ((env.VERCEL_ENV === 'preview' ? env.VERCEL_BRANCH_URL : '') || env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  return host && /^[a-z0-9.-]+$/i.test(host) ? 'https://' + host : 'https://buyback-admin.vercel.app';
}

export function unsubscribeUrl(base: string, token: string, lang: Lang): string {
  return `${base}/api/public/aanvraag/uitschrijven?t=${encodeURIComponent(token)}&l=${lang}`;
}

export type DemandRow = { collection_handle: string; config_key: string; grades: number[]; status: string; created_at: string; notified_at: string | null };
export type Demand = { collection: string; config: string; open: number; byGrade: Record<3 | 4 | 5, number>; oldest: string | null; notified30: number };

/** Vraag per collectie en configuratie voor de overzichtspagina: open aanvragen (en per aanvaarde staat), oudste, verwittigd in 30 dagen. */
export function demandSummary(rows: DemandRow[], now = Date.now()): Demand[] {
  const map = new Map<string, Demand>();
  const since = now - 30 * 86400_000;
  for (const r of rows) {
    const k = r.collection_handle + '|' + r.config_key;
    const d = map.get(k) ?? { collection: r.collection_handle, config: r.config_key, open: 0, byGrade: { 3: 0, 4: 0, 5: 0 }, oldest: null, notified30: 0 };
    if (r.status === 'open') {
      d.open++;
      for (const g of [3, 4, 5] as const) if ((r.grades ?? []).includes(g)) d.byGrade[g]++;
      if (!d.oldest || r.created_at < d.oldest) d.oldest = r.created_at;
    } else if (r.status === 'notified' && r.notified_at && Date.parse(r.notified_at) >= since) d.notified30++;
    map.set(k, d);
  }
  return [...map.values()].filter(d => d.open || d.notified30).sort((a, b) => b.open - a.open || a.collection.localeCompare(b.collection) || a.config.localeCompare(b.config));
}

/** "refurbished-macbook-air-13-m2" → "MacBook Air 13 M2". */
export function collectionName(handle: string): string {
  return handle.replace(/^refurbished-/, '').split('-').map(w => (w === 'macbook' ? 'MacBook' : /^m\d$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
