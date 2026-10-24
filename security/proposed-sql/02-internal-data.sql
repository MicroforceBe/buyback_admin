-- VOORSTEL. Eerst publieke widget/diagnosebrug in een testomgeving verifiëren.
-- Behoud expliciet service_role-toegang. De eigen beheerlogin is GEEN
-- Supabase Auth-login; geef daarom geen algemene authenticated-policies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buyback_import_staging', 'buyback_csv_landing', 'buyback_global_seq',
    'buyback_settings', 'buyback_email_templates', 'buyback_leads',
    'buyback_multipliers_landing', 'buyback_prices_landing',
    'erp_articles', 'erp_settings',
    'refurb_receptions', 'refurb_reception_items', 'refurb_suppliers',
    'refurb_status_options', 'refurb_location_options', 'refurb_models',
    'refurb_status_transitions', 'DeviceUnit', 'DiagnosticSession',
    'DiagnosticTestResult', 'DiagnosticAppTestResult',
    'diagnostics_stations', 'diagnostics_sessions'
  ] LOOP
    -- Een ontbrekende tabel is een afwijking: transactie afbreken, niet negeren.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON TABLE public.buyback_import_parsed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.buyback_import_parsed TO service_role;
COMMIT;
