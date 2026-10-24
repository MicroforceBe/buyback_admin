-- Na goedgekeurde toepassing: uitsluitend metadata. Verwacht geen gevoelige
-- tabelrechten voor anon/authenticated, en alle public-tabellen met RLS aan.
BEGIN READ ONLY;
SELECT c.relname AS missing_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
SELECT role_name, table_name, privilege
FROM (VALUES ('anon'),('authenticated')) roles(role_name)
CROSS JOIN (VALUES ('buyback_admin_users'),('buyback_admin_sessions'),('buyback_lead_events'),
  ('buyback_leads'),('refurb_receptions'),('refurb_reception_items'),('DeviceUnit'),('erp_settings')) tables(table_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) privileges(privilege)
WHERE has_table_privilege(role_name,format('public.%I',table_name),privilege);
SELECT c.relname,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v';
SELECT has_function_privilege('anon','public.delete_refurb_reception_secure(uuid)','EXECUTE') AS anon_delete_rpc,
  has_function_privilege('service_role','public.delete_refurb_reception_secure(uuid)','EXECUTE') AS backend_delete_rpc;
COMMIT;
