-- Alleen catalogusmetadata; geen records, sessietokens of credentials ophalen.
BEGIN READ ONLY;
SELECT current_database(), version();
SELECT c.relname, c.relkind, c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
  has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
  has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
  has_table_privilege('anon',c.oid,'DELETE') AS anon_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','v') ORDER BY c.relname;
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public';
SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS data_type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='public' AND c.relname IN ('refurb_receptions','refurb_reception_items')
  AND a.attname IN ('id','reception_id','refurb_status') AND a.attnum>0;
COMMIT;
