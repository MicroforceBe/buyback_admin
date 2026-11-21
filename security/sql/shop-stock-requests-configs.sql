-- Verwittigingen: configuraties van alle modelpagina's toelaten in config_key (de oorspronkelijke controle liet alleen
-- MacBook-configuraties toe, waardoor aanvragen voor iPhone, Samsung en iPad door de database geweigerd werden).
--   MacBook:          "M2/16GB/1TB", "M1 Pro/16GB/512GB"
--   iPhone / Samsung: "128GB", "1TB"
--   iPad:             "256GB Wi-Fi", "256GB Cellular"
-- Zelfde patronen als MAC_KEY, IPHONE_KEY en IPAD_KEY in lib/stockRequests/core.ts.
-- Toepassen na security/sql/shop-stock-requests.sql, eerst op test; productie pas bij livegang met akkoord.
alter table public.shop_stock_requests drop constraint if exists shop_stock_requests_config_key_check;
alter table public.shop_stock_requests add constraint shop_stock_requests_config_key_check
  check (config_key ~ '^(M[1-9]( Pro| Max)?/[0-9]{1,3}GB/[0-9]{1,4}(GB|TB)|([0-9]{2,4}GB|[1-9]TB)( Wi-Fi| Cellular)?)$');
