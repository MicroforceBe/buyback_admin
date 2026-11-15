import 'server-only';
// Uitverkochte refurbished toestellen van één modelcollectie, voor "Verwittig mij" en "Op aanvraag" op de modelpagina van
// de webshop. Shopify toont producten met status "Niet vermeld" (UNLISTED) niet in een collectie op de winkel, dus de theme
// kan ze zelf niet vinden. Deze helper leest ze via de Admin API. Opslag, staat, verbinding en configuratie komen uit de
// ERP-velden (lib/shopify/erp.ts), nooit uit de handle; de handle dient alleen als link naar de productpagina.
import { ERP_FIELDS_GQL, erpConfig, erpFields, erpGrade, erpNet, erpSize, NEW_IN_BOX_GRADE, type DeviceKind, type ErpRaw } from './erp';

export { NEW_IN_BOX_GRADE };

function soldOutQuery(withSwatch: boolean): string {
  return `query SoldOut($handle: String!, $after: String) {
  collectionByIdentifier(identifier: { handle: $handle }) {
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        handle
        status
        totalInventory${ERP_FIELDS_GQL}${withSwatch ? `
        swatch: metafield(namespace: "custom", key: "color_swatch") {
          reference { ... on Metaobject { name: field(key: "name") { value } } }
        }` : ''}
      }
    }
  }
}`;
}

export const SOLD_OUT_QUERY = soldOutQuery(true);
/**
 * Zelfde vraag zonder kleurstaal, als de vraag met kleurstaal mislukt. Pagina's van 100 producten: de vraag met 250
 * producten en de kleurstaal ging over de maximale kost van Shopify, waardoor de kleur (Olivier, 15/11) altijd ontbrak.
 */
export const SOLD_OUT_QUERY_BASIC = soldOutQuery(false);

export type SoldOutNode = ErpRaw & { handle: string; status: string; totalInventory: number | null; swatch?: { reference: { name?: { value: string | null } | null } | null } | null };
export type SoldOutRaw = { collectionByIdentifier: { products: { nodes: SoldOutNode[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } } | null };

/** Maximaal aantal pagina's van 100 producten per collectie (een modelcollectie heeft er zelden meer dan 250). */
export const SOLD_OUT_MAX_PAGES = 5;

/**
 * Eén uitverkocht toestel: handle (link), opslag ("128GB"), staat ("3", "4", "5" of "6" = Nieuw in Box), kleur,
 * verbinding ("Wi-Fi"/"Cellular", alleen iPad) en configuratie (zelfde sleutel als in de verwittigingen, bv. "M2/16GB/1TB").
 */
export type SoldOutItem = { handle: string; size: string; grade: string; colour: string; net: string; config: string };

export function soldOutItems(raw: SoldOutRaw, kind: DeviceKind = ''): SoldOutItem[] {
  const nodes = raw.collectionByIdentifier?.products.nodes ?? [];
  const out: SoldOutItem[] = [];
  for (const n of nodes) {
    // Alleen "Niet vermeld" (concepten zijn bewust nog niet klaar) met een staat in het ERP (refurbished of Nieuw in Box).
    if (n.status !== 'UNLISTED' || (n.totalInventory ?? 0) > 0) continue;
    const f = erpFields(n);
    const grade = erpGrade(f.condition);
    const size = erpSize(f.storage || f.ssd);
    if (!grade || !size) continue;
    out.push({
      handle: n.handle, size, grade: String(grade),
      colour: (n.swatch?.reference?.name?.value ?? f.colour ?? '').trim(),
      net: erpNet(f.net), config: erpConfig(kind, f),
    });
  }
  return out;
}
