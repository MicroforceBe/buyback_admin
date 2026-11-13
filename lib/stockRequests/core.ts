// Verwittigingen "Op aanvraag" op de MacBook- en iPhone-modelpagina's van microforce.be: pure functies (configuratie uit de handle,
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

/**
 * Configuratie van een iPhone uit de handle: de opslag ("128GB", "1TB"), of '' als het geen iPhone is.
 * Zelfde ontleding als in de theme (snippets/model-winkels.liquid en snippets/model-op-aanvraag.liquid): eerste GB/TB-woord.
 */
export function iphoneConfig(handle: string): string {
  const w = String(handle || '').toLowerCase().split('-');
  if (w[0] !== 'iphone') return '';
  const m = w.find(x => /^\d+(gb|tb)$/.test(x) && parseInt(x, 10) > 0);
  return m ? parseInt(m, 10) + (/tb$/.test(m) ? 'TB' : 'GB') : '';
}

/** Configuratie van een toestel: MacBook ("M2/16GB/1TB") of iPhone ("128GB"); '' als ze niet te lezen is. */
export function deviceConfig(handle: string): string {
  return macConfig(handle) || iphoneConfig(handle);
}

export const MAC_KEY = /^M[1-9]( Pro| Max)?\/[0-9]{1,3}GB\/[0-9]{1,4}(GB|TB)$/;
export const IPHONE_KEY = /^([0-9]{2,4}GB|[1-9]TB)$/;
export const CONFIG_KEY = new RegExp(`(${MAC_KEY.source})|(${IPHONE_KEY.source})`);

/** Leesbare naam van een configuratie in de taal van de klant: "M2 · 16 GB werkgeheugen · 1 TB opslag" of "128 GB opslag". */
export function configLabel(key: string, lang: Lang): string {
  const unit = (v: string) => { const m = /^(\d+)(GB|TB)$/.exec(v); if (!m) return v; return lang === 'fr' ? `${m[1]} ${m[2] === 'TB' ? 'To' : 'Go'}` : `${m[1]} ${m[2]}`; };
  const t = TEXT[lang];
  if (IPHONE_KEY.test(key)) return `${unit(key)} ${t.ssd}`;
  const [chip, ram, ssd] = key.split('/');
  return `${chip} · ${unit(ram)} ${t.ram} · ${unit(ssd)} ${t.ssd}`;
}

/**
 * Naam: alleen letters (ook met accenten), spaties, koppeltekens, punten en apostrofs; 1 tot 60 tekens; geen links of
 * cijfers. Zo kan niemand reclame of een link in een mail van Microforce laten zetten.
 */
export function validName(name: string): boolean {
  return /^[\p{L}][\p{L}\p{M} .'’-]{0,59}$/u.test(name) && !/(www|https?|\.(com|be|net|org|nl|io)\b)/i.test(name);
}

/** iPhone-modelpagina's met een afwijkende handle (niet "refurbished-iphone-…"), met hun naam. */
export const IPHONE_EXTRA: Record<string, string> = {
  'microforce-iphone-iphone-12': 'iPhone 12',
  'iphone-15-pro': 'iPhone 15 Pro',
  'refurbisehd-iphone-17': 'iPhone 17',
  'iphone-17-pro': 'iPhone 17 Pro',
};

export type RequestInput = { name: string; email: string; language: Lang; collection: string; keys: string[]; grades: number[]; consentVersion: string };
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
  if (!validName(name)) return { ok: false, error: 'invalid' };
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return { ok: false, error: 'invalid' };
  const soort = /^refurbished-macbook-[a-z0-9-]{1,80}$/.test(collection) ? 'mac' : /^refurbished-iphone-[a-z0-9-]{1,80}$/.test(collection) || Object.prototype.hasOwnProperty.call(IPHONE_EXTRA, collection) ? 'iphone' : '';
  if (!soort) return { ok: false, error: 'invalid' };
  if (!grades.length || !grades.every(g => g === 3 || g === 4 || g === 5)) return { ok: false, error: 'invalid' };
  const keyOk = soort === 'mac' ? MAC_KEY : IPHONE_KEY;
  if (!keys.length || keys.length > MAX_CONFIGS || !keys.every(k => keyOk.test(k))) return { ok: false, error: 'invalid' };
  if (b.consent !== true) return { ok: false, error: 'consent' };
  // Versie van de toestemmingstekst (bewijs van toestemming), bv. "nl-2026-11-12".
  const consentVersion = typeof b.consentVersion === 'string' && /^[a-z0-9.-]{1,24}$/.test(b.consentVersion) ? b.consentVersion : 'v1';
  return { ok: true, value: { name, email, language, collection, keys, grades, consentVersion } };
}

export type OpenRequest = { id: string; name: string; email: string; language: Lang; collection_handle: string; config_key: string; config_label: string; grades: number[]; token: string };
export type ShopProduct = { handle: string; status: string; totalInventory: number | null; price: number | null; image?: string | null };
export type Match = { request: OpenRequest; product: { handle: string; grade: number; price: number | null; image?: string | null }; model?: string };

/** Per open aanvraag het goedkoopste actieve toestel op voorraad met die configuratie in een van de gekozen staten. */
export function matchRequests(requests: OpenRequest[], productsByCollection: Map<string, ShopProduct[]>): Match[] {
  const out: Match[] = [];
  for (const r of requests) {
    let best: Match['product'] | null = null;
    for (const p of productsByCollection.get(r.collection_handle) ?? []) {
      if (p.status !== 'ACTIVE' || (p.totalInventory ?? 0) <= 0 || deviceConfig(p.handle) !== r.config_key) continue;
      const grade = Number(parseHandle(p.handle)?.grade ?? 0);
      if (!r.grades.includes(grade)) continue;
      if (!best || (p.price ?? Infinity) < (best.price ?? Infinity)) best = { handle: p.handle, grade, price: p.price, image: p.image ?? null };
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
    confirmSubject: 'Bedankt voor jouw aanvraag bij Microforce',
    confirmTitle: 'Bedankt voor jouw aanvraag',
    confirmIntro: 'We gaan aan de slag om zo snel mogelijk het geschikte toestel voor jou te vinden. Als jouw gewenst model bestelbaar is of terug op voorraad is, brengen we je op de hoogte.',
    yourRequest: 'Jouw aanvraag', looks: 'Gekozen uiterlijk', band: 'Refurbished met 24 maanden garantie', mikeSearch: 'Ik ga alvast op zoek voor jou.', mikeFound: 'Ik heb iets voor je gevonden!',
    tpExcellent: 'Uitstekend', tpReviews: (n: string) => `op basis van ${n} reviews`, tpLink: 'Lees onze reviews op Trustpilot', shops: 'Winkels in jouw buurt: Gentbrugge · Antwerpen · Oudenaarde',
    gradeLine: (g: string) => `Staat: ${g}.`, anyGrade: 'Elke staat is goed.',
    confirmOutro: 'Je aanvraag blijft 6 maanden geldig. We gebruiken je gegevens alleen hiervoor.',
    availSubject: 'Je MacBook is terug op voorraad bij Microforce',
    availIntro: 'Goed nieuws: een MacBook waarvoor je een verwittiging vroeg, is terug op voorraad.',
    view: 'Bekijk het toestel', grade: 'Staat', availOutro: 'Op = op: refurbished toestellen zijn uniek. Wil je hem zeker? Bestel online of kom langs in Gentbrugge, Antwerpen of Oudenaarde.',
    unsub: 'Geen interesse meer? Schrijf je uit', sign: 'Micro Mike en het team van Microforce', questions: 'Vragen? Mail ons op',
    pageTitle: 'Verwittiging stopzetten', pageAsk: 'Wil je geen mail meer krijgen voor deze aanvraag?', pageBtn: 'Uitschrijven',
    pageDone: 'Je bent uitgeschreven. Je krijgt voor deze aanvraag geen mail meer.', pageGone: 'Deze aanvraag is al afgesloten of bestaat niet meer.', back: 'Naar microforce.be',
  },
  fr: {
    ram: 'mémoire', ssd: 'stockage', hi: (n: string) => `Bonjour ${n},`,
    confirmSubject: 'Merci pour votre demande chez Microforce',
    confirmTitle: 'Merci pour votre demande',
    confirmIntro: 'Nous nous mettons au travail pour trouver au plus vite l’appareil qui vous convient. Dès que le modèle souhaité peut être commandé ou est de nouveau en stock, nous vous prévenons.',
    yourRequest: 'Votre demande', looks: 'Aspect choisi', band: 'Reconditionné avec 24 mois de garantie', mikeSearch: 'Je pars déjà à la recherche pour vous.', mikeFound: 'J’ai trouvé quelque chose pour vous !',
    tpExcellent: 'Excellent', tpReviews: (n: string) => `sur la base de ${n} avis`, tpLink: 'Lisez nos avis sur Trustpilot', shops: 'Nos magasins : Gentbrugge · Anvers · Audenarde',
    gradeLine: (g: string) => `État : ${g}.`, anyGrade: 'Tous les états conviennent.',
    confirmOutro: 'Votre demande reste valable 6 mois. Nous utilisons vos données uniquement à cette fin.',
    availSubject: 'Votre MacBook est de nouveau en stock chez Microforce',
    availIntro: 'Bonne nouvelle : un MacBook pour lequel vous avez demandé une alerte est de nouveau en stock.',
    view: 'Voir l’appareil', grade: 'État', availOutro: 'Chaque appareil reconditionné est unique. Vous le voulez ? Commandez en ligne ou passez à Gentbrugge, Anvers ou Audenarde.',
    unsub: 'Plus intéressé ? Se désinscrire', sign: 'Micro Mike et l’équipe Microforce', questions: 'Des questions ? Écrivez-nous à',
    pageTitle: 'Arrêter l’alerte', pageAsk: 'Vous ne souhaitez plus recevoir d’e-mail pour cette demande ?', pageBtn: 'Se désinscrire',
    pageDone: 'Vous êtes désinscrit. Vous ne recevrez plus d’e-mail pour cette demande.', pageGone: 'Cette demande est déjà clôturée ou n’existe plus.', back: 'Vers microforce.be',
  },
  en: {
    ram: 'memory', ssd: 'storage', hi: (n: string) => `Hi ${n},`,
    confirmSubject: 'Thank you for your request at Microforce',
    confirmTitle: 'Thank you for your request',
    confirmIntro: 'We are getting to work to find the right device for you as quickly as possible. As soon as your chosen model can be ordered or is back in stock, we will let you know.',
    yourRequest: 'Your request', looks: 'Chosen condition', band: 'Refurbished with a 24-month warranty', mikeSearch: 'I’m already searching for you.', mikeFound: 'I found something for you!',
    tpExcellent: 'Excellent', tpReviews: (n: string) => `based on ${n} reviews`, tpLink: 'Read our reviews on Trustpilot', shops: 'Our shops: Gentbrugge · Antwerp · Oudenaarde',
    gradeLine: (g: string) => `Condition: ${g}.`, anyGrade: 'Any condition is fine.',
    confirmOutro: 'Your request stays valid for 6 months. We only use your details for this.',
    availSubject: 'Your MacBook is back in stock at Microforce',
    availIntro: 'Good news: a MacBook you asked us to notify you about is back in stock.',
    view: 'View the device', grade: 'Condition', availOutro: 'Every refurbished device is unique. Want it? Order online or visit us in Gentbrugge, Antwerp or Oudenaarde.',
    unsub: 'No longer interested? Unsubscribe', sign: 'Micro Mike and the Microforce team', questions: 'Questions? Email us at',
    pageTitle: 'Stop alert', pageAsk: 'Do you no longer want emails for this request?', pageBtn: 'Unsubscribe',
    pageDone: 'You are unsubscribed. You will no longer receive emails for this request.', pageGone: 'This request is already closed or no longer exists.', back: 'Go to microforce.be',
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type Mail = { subject: string; html: string; text: string };

/**
 * Trustpilot-score onderaan de mails. Handmatig bijwerken (Trustpilot Business → overzicht); afgerond naar beneden
 * zodat de mail nooit meer belooft dan de pagina toont. Stand 12/11/2026: TrustScore 4,7, 2.661 reviews.
 */
export const TRUSTPILOT = { score: 4.7, reviews: 2600, url: 'https://nl-be.trustpilot.com/review/microforce.be' };
export const MAIL_LOGO = 'https://cdn.shopify.com/s/files/1/0773/4293/3324/files/microforce-logo-2022-72dpi-250X50.png?v=1694941598&width=420';
export const MIKE_FOUND = 'https://cdn.shopify.com/s/files/1/0773/4293/3324/files/micro-mike-dank-favicon.png?v=1794483965';

/** Hoofdcategorie uit de handle van de modelcollectie: MacBook, iPhone, iPad, … (anders null). */
export function mainCategory(handle: string): string | null {
  const h = '-' + String(handle || '').toLowerCase() + '-';
  const map: [RegExp, string][] = [[/-macbook-/, 'MacBook'], [/-iphone-/, 'iPhone'], [/-ipad-/, 'iPad'], [/-imac-/, 'iMac'], [/-mac-mini-/, 'Mac mini'],
    [/-(apple-)?watch-/, 'Apple Watch'], [/-(samsung|galaxy)-/, 'Samsung Galaxy'], [/-airpods-/, 'AirPods']];
  for (const [re, name] of map) if (re.test(h)) return name;
  return null;
}

/** Tekst in de blauwe band: "Jouw gewenste MacBook" (FR/EN vertaald); zonder herkende categorie "toestel". */
export function wishBand(handle: string, lang: Lang): string {
  const c = mainCategory(handle);
  if (lang === 'fr') return c ? `Votre ${c} souhaité${c === 'Apple Watch' ? 'e' : ''}` : 'Votre appareil souhaité';
  if (lang === 'en') return `Your desired ${c ?? 'device'}`;
  return `Jouw gewenste ${c ?? 'toestel'}`;
}

/** Vijf groene Trustpilot-vakjes als tabel (werkt ook in Outlook); een halve ster als half gevuld vakje. */
function tpStars(score: number): string {
  const cell = (fill: number) => {
    const bg = fill >= 1 ? '#00b67a' : '#dcdce6';
    const inner = fill > 0 && fill < 1
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="22" height="22" style="width:22px;height:22px"><tr><td width="11" bgcolor="#00b67a" style="background:#00b67a"></td><td width="11" bgcolor="#dcdce6" style="background:#dcdce6"></td></tr></table>`
      : '';
    return `<td width="22" height="22" bgcolor="${bg}" style="width:22px;height:22px;background:${bg};text-align:center;vertical-align:middle;color:#fff;font-size:15px;line-height:22px;padding:0">`
      + (inner || '&#9733;') + `</td><td width="3" style="width:3px"></td>`;
  };
  const r = Math.round(score * 2) / 2;
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>${[1, 2, 3, 4, 5].map(i => cell(r >= i ? 1 : r >= i - 0.5 ? 0.5 : 0)).join('')}</tr></table>`;
}

function frame(lang: Lang, body: string, unsubscribeUrl: string, mike: 'zoek' | 'gevonden' = 'zoek', collection = ''): string {
  const t = TEXT[lang];
  const bandText = collection ? wishBand(collection, lang) : t.band;
  let assets = 'https://buyback-admin.vercel.app';
  try { assets = new URL(unsubscribeUrl).origin; } catch { /* standaard */ }
  const mikeImg = mike === 'zoek' ? `${assets}/mail/micro-mike-zoek.png` : MIKE_FOUND;
  const balloon = mike === 'zoek' ? t.mikeSearch : t.mikeFound;
  const home = SHOP + (lang === 'nl' ? '' : '/' + lang);
  const n = new Intl.NumberFormat(lang === 'en' ? 'en-IE' : lang === 'fr' ? 'fr-BE' : 'nl-BE');
  const score = n.format(TRUSTPILOT.score);
  const reviews = n.format(TRUSTPILOT.reviews) + '+';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Microforce</title></head>`
    + `<body style="margin:0;padding:0;background:#f2f6fa"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fa;padding:24px 0;font-family:Arial,Helvetica,sans-serif"><tr><td align="center">`
    + `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">`
    + `<tr><td style="background:#ffffff;padding:24px 28px 18px;text-align:center"><a href="${home}" style="text-decoration:none"><img src="${MAIL_LOGO}" width="210" height="42" alt="Microforce" style="display:inline-block;border:0;width:210px;height:42px"></a></td></tr>`
    + `<tr><td style="background:#1080cf;padding:8px 28px;text-align:center;color:#ffffff;font-size:13px;font-weight:700">${escapeHtml(bandText)}</td></tr>`
    + `<tr><td style="padding:28px 32px 6px;color:#14222f;font-size:16px;line-height:1.55">${body}</td></tr>`
    // Handtekening: Micro Mike met tekstballon.
    + `<tr><td style="padding:10px 20px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td width="112" style="width:112px;vertical-align:bottom;padding-right:8px"><img src="${mikeImg}" width="108" height="109" alt="Micro Mike" style="display:block;border:0;width:108px;height:auto"></td>`
    + `<td style="vertical-align:middle"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f8fd;border-radius:14px"><tr><td style="padding:14px 18px;text-align:left">`
    + `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#14222f">&ldquo;${escapeHtml(balloon)}&rdquo;</p>`
    + `<p style="margin:0;font-size:14px;color:#3c4752">${escapeHtml(t.sign)}</p></td></tr></table></td></tr></table></td></tr>`
    + `<tr><td style="padding:16px 32px 6px;color:#3c4752;font-size:14px;line-height:1.55">${escapeHtml(t.questions)} <a href="mailto:klantenservice@microforce.be" style="color:#1080cf">klantenservice@microforce.be</a>.</td></tr>`
    // Trustpilot-score.
    + `<tr><td style="padding:18px 32px 24px" align="center"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border:1px solid #e3e9f0;border-radius:14px"><tr><td style="padding:14px 22px;text-align:center">`
    + `<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#14222f">${escapeHtml(t.tpExcellent)} &nbsp;<span style="color:#00b67a">${score}</span>/5</p>`
    + tpStars(TRUSTPILOT.score)
    + `<p style="margin:8px 0 0;font-size:12px;color:#5b6470"><span style="color:#00b67a;font-weight:700">&#9733; Trustpilot</span> &middot; ${escapeHtml(t.tpReviews(reviews))}</p>`
    + `<p style="margin:6px 0 0;font-size:12px"><a href="${TRUSTPILOT.url}" style="color:#1080cf">${escapeHtml(t.tpLink)}</a></p>`
    + `</td></tr></table></td></tr>`
    + `<tr><td style="background:#14222f;padding:18px 28px;text-align:center;color:#c9d3dd;font-size:12px;line-height:1.7">${escapeHtml(t.shops)}<br>`
    + `<a href="https://www.facebook.com/Microforce.be" style="color:#ffffff;text-decoration:none">Facebook</a> &nbsp;&middot;&nbsp; <a href="${home}" style="color:#ffffff;text-decoration:none">www.microforce.be</a><br>`
    + `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#8fa1b3">${escapeHtml(t.unsub)}</a></td></tr>`
    + `</table></td></tr></table></body></html>`;
}

/** Een gevraagde configuratie in de mail: modelnaam (titel van de modelcollectie) en een algemene foto van dat model. */
export type MailItem = { key: string; model?: string; image?: string | null };

/** Foto op e-mailformaat via de Shopify-CDN (alleen https-afbeeldingen van cdn.shopify.com). */
export function mailImage(url: string | null | undefined, width = 240): string | null {
  if (!url || !/^https:\/\/cdn\.shopify\.com\//.test(url)) return null;
  return url + (url.includes('?') ? '&' : '?') + 'width=' + width;
}

/** Per configuratie de foto van een toestel uit de modelcollectie: liefst dezelfde configuratie, anders eender welk. */
export function pickImages(keys: string[], products: { handle: string; image?: string | null }[]): Record<string, string | null> {
  const any = products.find(p => p.image)?.image ?? null;
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = products.find(p => p.image && deviceConfig(p.handle) === k)?.image ?? any;
  return out;
}

/** "MacBook Air 13" M2 (2022)" uit de collectietitel (zonder "Refurbished"). */
export function modelName(title: string | null | undefined): string {
  return String(title || '').replace(/\b(refurbished|reconditionn[ée]e?s?)\b/gi, '').replace(/\s+/g, ' ').trim();
}

/** Gekozen uiterlijk als nette pillen met sterren (3 = ★★★ Behoorlijk … 5 = ★★★★★ Als nieuw). */
function gradePills(grades: number[], lang: Lang): string {
  const g = [...new Set(grades)].filter(x => x >= 3 && x <= 5).sort();
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` + g.map(x =>
    `<td style="padding:0 6px 6px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #cfe3f4;border-radius:999px;background:#ffffff"><tr>`
    + `<td style="padding:5px 12px;white-space:nowrap;font-size:13px;color:#14222f"><span style="color:#f5a623;font-size:13px;letter-spacing:1px">${'&#9733;'.repeat(x)}</span>`
    + `<span style="color:#d6dde6;font-size:13px;letter-spacing:1px">${'&#9733;'.repeat(5 - x)}</span>&nbsp; <b>${escapeHtml(GRADE[lang][x])}</b></td></tr></table></td>`).join('') + `</tr></table>`;
}

/** Eén configuratie als rij: foto links, model en configuratie rechts. */
function itemRow(item: MailItem, lang: Lang, extra = ''): string {
  const img = mailImage(item.image);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;background:#ffffff;border:1px solid #e3e9f0;border-radius:12px"><tr>`
    + (img ? `<td width="96" style="width:96px;padding:10px 0 10px 10px;vertical-align:middle"><img src="${escapeHtml(img)}" width="86" alt="${escapeHtml(item.model || 'Microforce')}" style="display:block;border:0;width:86px;height:auto;border-radius:8px"></td>` : '')
    + `<td style="padding:12px 14px;vertical-align:middle">`
    + (item.model ? `<p style="margin:0 0 3px;font-size:16px;font-weight:700;color:#14222f">${escapeHtml(item.model)}</p>` : '')
    + `<p style="margin:0;font-size:14px;color:#3c4752">${escapeHtml(configLabel(item.key, lang))}</p>${extra}</td></tr></table>`;
}

/** Bevestiging na het aanvragen. */
export function confirmationMail(lang: Lang, name: string, keys: (string | MailItem)[], grades: number[], unsubscribeUrl: string, collection = ''): Mail {
  const t = TEXT[lang];
  const items: MailItem[] = keys.map(k => (typeof k === 'string' ? { key: k } : k));
  const labels = items.map(i => (i.model ? i.model + ' – ' : '') + configLabel(i.key, lang));
  const gl = gradesLabel(grades, lang);
  const grade = gl ? t.gradeLine(gl) : t.anyGrade;
  const html = frame(lang, `<p style="margin:0 0 6px;font-size:20px;font-weight:700">${escapeHtml(t.confirmTitle)}</p>`
    + `<p style="margin:0 0 14px">${escapeHtml(t.hi(name))}</p><p style="margin:0 0 16px">${escapeHtml(t.confirmIntro)}</p>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;border:1px solid #e3e9f0;border-radius:12px"><tr><td style="padding:14px 14px 6px">`
    + `<p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#5b6470;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(t.yourRequest)}</p>`
    + items.map(i => itemRow(i, lang)).join('')
    + `<p style="margin:6px 0 8px;font-size:13px;font-weight:700;color:#5b6470;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(t.looks)}</p>`
    + gradePills(grades, lang) + `</td></tr></table>`
    + `<p style="margin:12px 0 0;font-size:13px;color:#5b6470">${escapeHtml(t.confirmOutro)}</p>`, unsubscribeUrl, 'zoek', collection);
  const text = [t.confirmTitle, '', t.hi(name), '', t.confirmIntro, '', t.yourRequest + ':', ...labels.map(l => '- ' + l), grade, '', t.confirmOutro, '', `"${t.mikeSearch}"`, t.sign, '', `${t.unsub}: ${unsubscribeUrl}`].join('\n');
  return { subject: t.confirmSubject, html, text };
}

/** "MacBook" in een mailtekst vervangen door de categorie van de modelcollectie (iPhone, …). */
function device(text: string, collection: string | undefined): string {
  const c = mainCategory(collection || '');
  return c && c !== 'MacBook' ? text.replace(/MacBook/g, c) : text;
}

/** Mail zodra een gevraagde configuratie op voorraad is (alle matches van één e-mailadres samen). */
export function availableMail(lang: Lang, name: string, matches: Match[], unsubscribeUrl: string): Mail {
  const t = TEXT[lang];
  const rows = matches.map(m => ({ key: m.request.config_key, model: m.model, image: m.product.image, g: m.product.grade, label: (m.model ? m.model + ' – ' : '') + configLabel(m.request.config_key, lang), url: productUrl(m.product.handle, lang), grade: GRADE[lang][m.product.grade] ?? '', price: money(m.product.price, lang) }));
  const intro = device(t.availIntro, matches[0]?.request.collection_handle);
  const html = frame(lang, `<p style="margin:0 0 12px">${escapeHtml(t.hi(name))}</p><p style="margin:0 0 14px">${escapeHtml(intro)}</p>`
    + rows.map(r => itemRow({ key: r.key, model: r.model, image: r.image }, lang,
      `<p style="margin:6px 0 10px;font-size:14px;color:#3c4752"><span style="color:#f5a623;letter-spacing:1px">${'&#9733;'.repeat(r.g)}</span><span style="color:#d6dde6;letter-spacing:1px">${'&#9733;'.repeat(Math.max(0, 5 - r.g))}</span> ${escapeHtml(r.grade)}${r.price ? ` · <strong style="color:#1080cf">${escapeHtml(r.price)}</strong>` : ''}</p>`
      + `<a href="${escapeHtml(r.url)}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:#1080cf;color:#fff;font-weight:700;font-size:14px;text-decoration:none">${escapeHtml(t.view)}</a>`)).join('')
    + `<p style="margin:0;font-size:13px;color:#5b6470">${escapeHtml(t.availOutro)}</p>`, unsubscribeUrl, 'gevonden', matches[0]?.request.collection_handle ?? '');
  const text = [t.hi(name), '', intro, '', ...rows.flatMap(r => [`${r.label} (${t.grade}: ${r.grade}${r.price ? ', ' + r.price : ''})`, r.url, '']), t.availOutro, '', t.sign, '', `${t.unsub}: ${unsubscribeUrl}`].join('\n');
  return { subject: device(t.availSubject, matches[0]?.request.collection_handle), html, text };
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

/** "refurbished-macbook-air-13-m2" → "MacBook Air 13 M2", "refurbished-iphone-16-pro" → "iPhone 16 Pro". */
export function collectionName(handle: string): string {
  if (Object.prototype.hasOwnProperty.call(IPHONE_EXTRA, handle)) return IPHONE_EXTRA[handle];
  return handle.replace(/^refurbished-/, '').split('-').map(w => (w === 'macbook' ? 'MacBook' : w === 'iphone' ? 'iPhone' : /^m\d$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/** Afzender van de webshopmails: altijd de naam "Microforce klantenservice" met het adres uit de instelling. */
export function shopSender(from: string | undefined): string {
  const raw = (from || '').trim();
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const addr = m ? m[1] : raw;
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(addr) ? `Microforce klantenservice <${addr}>` : '';
}
