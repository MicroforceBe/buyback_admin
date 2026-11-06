export const MODES = { off: 'Uit', shadow: 'Schaduw (alleen vergelijken)', live: 'Live (schrijft naar Shopify)' } as const;
export type Mode = keyof typeof MODES;
export const PATH = '/admin/erp/shopify';
export const back = (params: Record<string, string>) => `${PATH}?${new URLSearchParams(params)}`;
