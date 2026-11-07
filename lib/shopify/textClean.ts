// Clean-up of pasted texts for products and collections: removes hidden <script> code and replaces
// "[Bedrijfsnaam]" by the shop name, and undoes that exactly. Shared by both reports; I/O is passed in.
import { addDescriptionAlts, cleanDescription, htmlHash, undoClean, type DescriptionEdit } from '@/lib/shopify/seo';

/**
 * Above this size (UTF-8 bytes of the JSON of the removed parts) the clean-up is not done: the undo data
 * must fit in the log (64 KB per row in the database). The margin covers JSONB overhead; no compression assumed.
 */
export const MAX_CLEAN_UNDO_BYTES = 48_000;

export type CleanOutcome =
  | { done: false; reason: string }
  | { done: true; detail: string; old_value: { edits: DescriptionEdit[] } | null; new_value: { hash: string; scripts: number; names: number; images: number } | null; html: string };

export async function applyClean(html: string, write: (html: string) => Promise<void>, read: () => Promise<string | null>): Promise<CleanOutcome> {
  const c = cleanDescription(html);
  if (!c.edits.length) return { done: false, reason: 'geen verborgen code, lege afbeelding of [Bedrijfsnaam] meer gevonden' };
  if (new TextEncoder().encode(JSON.stringify({ edits: c.edits })).length > MAX_CLEAN_UNDO_BYTES) return { done: false, reason: 'te veel verborgen code om veilig terug te kunnen zetten; pas deze tekst manueel aan' };
  await write(c.html);
  // Undo rebuilds the original from positions in the cleaned text, so it needs Shopify to have kept that text exactly.
  // A failing check read leaves the undo available: undo itself refuses when the text differs (hash).
  let kept = true, unchecked = false;
  try { kept = (await read()) === c.html; } catch { unchecked = true; }
  const what = [c.scripts ? `${c.scripts} verborgen code-blok${c.scripts === 1 ? '' : 'ken'} verwijderd` : '', c.names ? `${c.names}× [Bedrijfsnaam] → Microforce` : '', c.images ? `${c.images} lege afbeelding${c.images === 1 ? '' : 'en'} verwijderd` : ''].filter(Boolean).join(' · ');
  const note = !kept ? ' (terugdraaien niet mogelijk: Shopify bewaarde de tekst anders)' : unchecked ? ' (niet gecontroleerd)' : '';
  return { done: true, detail: `${what}${note}`, html: c.html,
    old_value: kept ? { edits: c.edits } : null, new_value: kept ? { hash: htmlHash(c.html), scripts: c.scripts, names: c.names, images: c.images } : null };
}

export type AltOutcome =
  | { done: false; reason: string }
  | { done: true; detail: string; old_value: { edits: DescriptionEdit[] } | null; new_value: { hash: string; images: number } | null; html: string };

/** Alt texts for the images in a description; undone exactly like a clean-up (positions + hash). */
export async function applyDescriptionAlts(html: string, title: string, refurbished: boolean, write: (html: string) => Promise<void>, read: () => Promise<string | null>): Promise<AltOutcome> {
  const c = addDescriptionAlts(html, title, refurbished);
  if (!c.edits.length) return { done: false, reason: 'alle afbeeldingen in de beschrijving hebben al een alt-tekst' };
  if (new TextEncoder().encode(JSON.stringify({ edits: c.edits })).length > MAX_CLEAN_UNDO_BYTES) return { done: false, reason: 'te veel afbeeldingen om veilig terug te kunnen zetten; pas deze tekst manueel aan' };
  await write(c.html);
  let kept = true, unchecked = false;
  try { kept = (await read()) === c.html; } catch { unchecked = true; }
  const note = !kept ? ' (terugdraaien niet mogelijk: Shopify bewaarde de tekst anders)' : unchecked ? ' (niet gecontroleerd)' : '';
  return { done: true, detail: `${c.images} afbeelding${c.images === 1 ? '' : 'en'} in de beschrijving kreeg${c.images === 1 ? '' : 'en'} een alt-tekst${note}`, html: c.html,
    old_value: kept ? { edits: c.edits } : null, new_value: kept ? { hash: htmlHash(c.html), images: c.images } : null };
}

/** The original text, or the reason it cannot be rebuilt (text changed since the clean-up). */
export function cleanUndoHtml(current: string, oldValue: { edits?: DescriptionEdit[] } | null, newValue: { hash?: string } | null): { html: string } | { reason: string } {
  if (!oldValue?.edits || !newValue?.hash) return { reason: 'geen gegevens om terug te zetten' };
  if (htmlHash(current) !== newValue.hash) return { reason: 'tekst is sinds de aanpassing gewijzigd; niet teruggezet' };
  const html = undoClean(current, oldValue.edits);
  return html === null ? { reason: 'tekst komt niet overeen met de aanpassing; niet teruggezet' } : { html };
}
