import 'server-only';
// Uitverkochte refurbished toestellen van één modelcollectie, voor "Verwittig mij" op de modelpagina van de webshop.
// Shopify toont producten met status "Niet vermeld" (UNLISTED) niet in een collectie op de winkel, dus de theme kan ze
// zelf niet vinden. Deze helper leest ze via de Admin API: per product de handle, opslag, staat (sterren) en kleur.
// De productpagina's van die toestellen hebben de knop "Breng mij op de hoogte" van de app Stok.

export const SOLD_OUT_QUERY = `query SoldOut($handle: String!) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    products(first: 250) {
      nodes {
        handle
        status
        totalInventory
        swatch: metafield(namespace: "custom", key: "color_swatch") {
          reference { ... on Metaobject { name: field(key: "name") { value } } }
        }
      }
    }
  }
}`;

/** Zelfde vraag zonder kleur, voor het geval de app geen toegang heeft tot metaobjecten. */
export const SOLD_OUT_QUERY_BASIC = SOLD_OUT_QUERY.replace(/\n\s*swatch: metafield[\s\S]*?\n\s*\}\n(?=\s*\}\n\s*\}\n\s*\}\n\}$)/, '\n');

export type SoldOutRaw = {
  collectionByIdentifier: {
    products: { nodes: { handle: string; status: string; totalInventory: number | null; swatch?: { reference: { name?: { value: string | null } | null } | null } | null }[] };
  } | null;
};

export type SoldOutItem = { handle: string; size: string; grade: string; colour: string };

/** Opslag ("128GB", "1TB") en staat ("3", "4", "5") uit de handle, bv. iphone-13-128gb-blue-refurbished-4-m. */
export function parseHandle(handle: string): { size: string; grade: string } | null {
  const words = handle.toLowerCase().split('-');
  let size = '';
  for (const w of words) {
    const m = /^(\d+)(gb|tb)$/.exec(w);
    if (m && Number(m[1]) > 0) { size = m[1] + m[2].toUpperCase(); break; }
  }
  const at = words.findIndex(w => w.includes('refurb'));
  if (!size || at < 0) return null;
  const grade = words.slice(at + 1).find(w => /^[345]$/.test(w)) ?? '';
  return grade ? { size, grade } : null;
}

export function soldOutItems(raw: SoldOutRaw): SoldOutItem[] {
  const nodes = raw.collectionByIdentifier?.products.nodes ?? [];
  const out: SoldOutItem[] = [];
  for (const n of nodes) {
    if (n.status !== 'UNLISTED' || (n.totalInventory ?? 0) > 0 || !n.handle.includes('refurb')) continue;
    const parsed = parseHandle(n.handle);
    if (!parsed) continue;
    out.push({ handle: n.handle, ...parsed, colour: (n.swatch?.reference?.name?.value ?? '').trim() });
  }
  return out;
}
