// Kenmerken van een toestel uit de ERP-velden (metavelden "magento.*" die de sync uit het ERP zet). Nooit uit de handle:
// die wordt één keer aangemaakt en niet bijgewerkt, en is soms fout ("265gb", "500ssd", geen opslag, verkeerde staat).
// Pure functies (geen netwerk), gebruikt door de verwittigingen (uitverkochte toestellen en matchen met de voorraad).

/** De ERP-velden in een GraphQL-productselectie (elk veld geeft { value }). */
export const ERP_FIELDS_GQL = `
        erpStorage: metafield(namespace: "magento", key: "internal_storage_capacity") { value }
        erpSsd: metafield(namespace: "magento", key: "solid_state_drive_capacity") { value }
        erpRam: metafield(namespace: "magento", key: "internal_memory") { value }
        erpFamily: metafield(namespace: "magento", key: "processor_family") { value }
        erpModel: metafield(namespace: "magento", key: "processor_model") { value }
        erpNet: metafield(namespace: "magento", key: "connectie") { value }
        erpCondition: metafield(namespace: "magento", key: "conditie") { value }
        erpColour: metafield(namespace: "magento", key: "colour_of_product") { value }`;

type V = { value?: string | null } | null | undefined;
export type ErpRaw = { erpStorage?: V; erpSsd?: V; erpRam?: V; erpFamily?: V; erpModel?: V; erpNet?: V; erpCondition?: V; erpColour?: V };
export type ErpFields = { storage?: string; ssd?: string; ram?: string; family?: string; model?: string; net?: string; condition?: string; colour?: string };

export function erpFields(raw: ErpRaw | null | undefined): ErpFields {
  const v = (x: V) => (x?.value ?? '').trim() || undefined;
  return {
    storage: v(raw?.erpStorage), ssd: v(raw?.erpSsd), ram: v(raw?.erpRam), family: v(raw?.erpFamily), model: v(raw?.erpModel),
    net: v(raw?.erpNet), condition: v(raw?.erpCondition), colour: v(raw?.erpColour),
  };
}

/** Staat 6 = Nieuw in Box (ERP-conditie "Nieuw"). */
export const NEW_IN_BOX_GRADE = 6;

/** Staat uit de ERP-conditie: "3* Goed" → 3, "4* Zeer Goed" → 4, "5* Als Nieuw" → 5, "Nieuw" → 6; anders 0. */
export function erpGrade(condition: string | undefined): number {
  const c = String(condition || '').trim();
  const m = /^([3-5])\s*\*/.exec(c);
  if (m) return Number(m[1]);
  return /^(nieuw|new)\b/i.test(c) ? NEW_IN_BOX_GRADE : 0;
}

/** Opslag als sleutel: "512 GB" → "512GB", "1 TB" → "1TB"; '' als het veld leeg of onleesbaar is. */
export function erpSize(value: string | undefined): string {
  const m = /(\d+)\s*(GB|TB)\b/i.exec(String(value || ''));
  return m && Number(m[1]) > 0 ? Number(m[1]) + m[2].toUpperCase() : '';
}

/** Werkgeheugen in GB: "16 GB" → 16; 0 als het veld leeg is. */
export function erpRam(value: string | undefined): number {
  const m = /(\d+)\s*GB\b/i.exec(String(value || ''));
  return m ? Number(m[1]) : 0;
}

/**
 * Apple-chip: "M1", "M2 Pro", "M1 Max". Eerst uit het processormodel ("Apple M2 Pro 12x CPU, 19x GPU"), want de
 * processorfamilie staat soms zonder Pro/Max in het ERP; anders uit de familie ("Apple M1 Pro"). '' bij Intel.
 */
export function erpChip(model: string | undefined, family: string | undefined): string {
  for (const s of [model, family]) {
    const m = /\bM([1-9])(?:\s*-?\s*(Pro|Max))?\b/i.exec(String(s || ''));
    if (m) return 'M' + m[1] + (m[2] ? ' ' + m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase() : '');
  }
  return '';
}

/** Verbinding van een iPad uit de ERP-connectie: "Wifi" → "Wi-Fi", "Wifi + 5G" / "Wifi + 4G" → "Cellular"; '' als leeg. */
export function erpNet(value: string | undefined): '' | 'Wi-Fi' | 'Cellular' {
  const c = String(value || '').trim();
  if (!c) return '';
  return /(4g|5g|lte|cellular)/i.test(c) ? 'Cellular' : 'Wi-Fi';
}

export type DeviceKind = 'mac' | 'iphone' | 'ipad' | '';

/**
 * Configuratie van een toestel uit de ERP-velden, per soort modelpagina:
 *   MacBook "M2/16GB/1TB" (chip, werkgeheugen, opslag), iPhone/Samsung "128GB", iPad "256GB Cellular".
 * '' als een nodig veld ontbreekt.
 */
export function erpConfig(kind: DeviceKind, f: ErpFields): string {
  if (kind === 'mac') {
    const chip = erpChip(f.model, f.family), ram = erpRam(f.ram), ssd = erpSize(f.ssd || f.storage);
    return chip && ram && ssd ? `${chip}/${ram}GB/${ssd}` : '';
  }
  const size = erpSize(f.storage);
  if (kind === 'iphone') return size;
  if (kind === 'ipad') { const net = erpNet(f.net); return size && net ? `${size} ${net}` : ''; }
  return '';
}
