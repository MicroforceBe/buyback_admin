-- Own Google feed: stock per store (local inventory). Additive only.
-- store_codes: Shopify location ID -> Google Business Profile store code (set on the marketing page).
alter table public.merchant_feed_settings add column store_codes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(store_codes) = 'object');
-- Hash of the stock per store last sent for an offer.
alter table public.merchant_feed_items add column local_hash text;
