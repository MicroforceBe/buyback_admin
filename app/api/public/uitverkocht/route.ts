import { NextResponse } from 'next/server';
import { createShopifyClient, shopifyConfig } from '@/lib/shopify/client';
import { SOLD_OUT_MAX_PAGES, SOLD_OUT_QUERY, SOLD_OUT_QUERY_BASIC, soldOutItems, type SoldOutNode, type SoldOutRaw } from '@/lib/shopify/soldOut';
import { collectionKind } from '@/lib/stockRequests/core';

// Publieke, alleen-lezen lijst met uitverkochte toestellen van één modelcollectie (handle, opslag, staat, kleur, verbinding en
// configuratie, uit de ERP-velden),
// voor "Verwittig mij" in de keuzehulp op de modelpagina's van microforce.be (snippet model-overzicht.liquid).
// Geen prijzen, voorraad of klantgegevens. CORS alleen voor de webshop; 15 minuten gecachet aan de rand.
export const dynamic = 'force-dynamic';

function origins(): string[] {
  const env = (process.env.PUBLIC_SHOP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : ['https://microforce.be', 'https://www.microforce.be'];
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const headers = cors(request);
  const handle = (new URL(request.url).searchParams.get('collection') || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(handle)) {
    return NextResponse.json({ error: 'Ongeldige collectie' }, { status: 400, headers });
  }
  try {
    const config = shopifyConfig();
    if (!config) return NextResponse.json({ error: 'Niet beschikbaar' }, { status: 503, headers });
    const client = createShopifyClient(config);
    // Alle pagina's ophalen; mislukt de vraag met kleurstaal, dan opnieuw zonder (kleur dan uit magento.colour_of_product).
    async function load(query: string): Promise<SoldOutRaw> {
      const nodes: SoldOutNode[] = [];
      let after: string | null = null;
      for (let page = 0; page < SOLD_OUT_MAX_PAGES; page++) {
        const r: SoldOutRaw = await client.graphql<SoldOutRaw>(query, { handle, after });
        if (!r.collectionByIdentifier) return r;
        nodes.push(...r.collectionByIdentifier.products.nodes);
        const info = r.collectionByIdentifier.products.pageInfo;
        if (!info?.hasNextPage || !info.endCursor) break;
        after = info.endCursor;
      }
      return { collectionByIdentifier: { products: { nodes } } };
    }
    let raw: SoldOutRaw;
    try { raw = await load(SOLD_OUT_QUERY); }
    catch (e) {
      console.error('[PUBLIC SOLD OUT] zonder kleurstaal:', e instanceof Error ? e.message.slice(0, 300) : 'onbekende fout');
      raw = await load(SOLD_OUT_QUERY_BASIC);
    }
    if (!raw.collectionByIdentifier) return NextResponse.json({ error: 'Collectie niet gevonden' }, { status: 404, headers });
    return NextResponse.json(
      { items: soldOutItems(raw, collectionKind(handle)) },
      { headers: { ...headers, 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
    );
  } catch {
    console.error('[PUBLIC SOLD OUT] failed');
    return NextResponse.json({ error: 'Tijdelijk niet beschikbaar' }, { status: 502, headers });
  }
}
