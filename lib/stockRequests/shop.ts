import 'server-only';
// Modelcollectie uit Shopify voor de verwittigingen: titel (modelnaam in de mail) en per product handle, status, voorraad,
// laagste prijs en foto (ook uitverkochte toestellen met status "Niet vermeld", voor een algemene foto van het model).
import { createShopifyClient, shopifyConfig, type ShopifyClient } from '@/lib/shopify/client';
import type { ShopProduct } from './core';

const COLLECTION_QUERY = `query StockRequestCollection($handle: String!) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    title
    products(first: 250) { nodes { handle status totalInventory priceRangeV2 { minVariantPrice { amount } } featuredMedia { preview { image { url } } } } }
  }
}`;
type Raw = { collectionByIdentifier: { title: string; products: { nodes: { handle: string; status: string; totalInventory: number | null; priceRangeV2?: { minVariantPrice?: { amount?: string } }; featuredMedia?: { preview?: { image?: { url?: string } | null } | null } | null }[] } } | null };

export type ShopCollection = { title: string; products: ShopProduct[] };

export function shopClient(): ShopifyClient | null {
  const config = shopifyConfig();
  return config ? createShopifyClient(config) : null;
}

export async function fetchCollection(client: ShopifyClient, handle: string): Promise<ShopCollection | null> {
  const raw = await client.graphql<Raw>(COLLECTION_QUERY, { handle });
  const c = raw.collectionByIdentifier;
  if (!c) return null;
  return {
    title: c.title,
    products: c.products.nodes.map(n => ({
      handle: n.handle, status: n.status, totalInventory: n.totalInventory,
      price: n.priceRangeV2?.minVariantPrice?.amount ? Number(n.priceRangeV2.minVariantPrice.amount) : null,
      image: n.featuredMedia?.preview?.image?.url ?? null,
    })),
  };
}
