export function parseSkuSearch(query: string): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const term of query.trim().split(/\s+/).filter(Boolean)) {
    if (term === '-') continue;
    if (term.startsWith('-') && term.length > 1) excluded.push(term.slice(1));
    else included.push(term);
  }
  return { included, excluded: Array.from(new Set(excluded.map(term => term.toLowerCase()))) };
}

export function escapeSkuSearchPattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function matchesSkuExclusions(row: { sku?: string | null; title?: string | null }, excluded: string[]): boolean {
  const text = `${row.sku ?? ''} ${row.title ?? ''}`.toLowerCase();
  return !excluded.some(term => text.includes(term.toLowerCase()));
}
