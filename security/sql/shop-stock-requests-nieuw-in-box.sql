-- Verwittigingen: staat 6 = "Nieuw in Box" toelaten (naast 3 Behoorlijk, 4 Zeer goed, 5 Als nieuw).
-- Het formulier biedt 6 alleen aan op een modelpagina waar uitsluitend Nieuw in Box-toestellen bestaan (Olivier, 14 november 2026).
-- Toepassen na security/sql/shop-stock-requests.sql, eerst op test; productie pas bij livegang met akkoord.
alter table public.shop_stock_requests drop constraint if exists shop_stock_requests_grades_check;
alter table public.shop_stock_requests add constraint shop_stock_requests_grades_check
  check (grades <@ '{3,4,5,6}'::smallint[] and cardinality(grades) between 1 and 4);
