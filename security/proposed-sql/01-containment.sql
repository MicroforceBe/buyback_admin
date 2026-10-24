-- VOORSTEL. Niet uitgevoerd. Alleen toepassen na expliciete productiegoedkeuring.
-- Target: poqyuyqguumfmldwffdv (Microforce-buyback), PostgreSQL 17.
-- Korte transactie: blokkeer directe clienttoegang tot accounts, sessies en events.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL PRIVILEGES ON TABLE public.buyback_admin_users,
  public.buyback_admin_sessions, public.buyback_lead_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.buyback_admin_users,
  public.buyback_admin_sessions, public.buyback_lead_events TO service_role;
ALTER TABLE public.buyback_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyback_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyback_lead_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_service_role ON public.buyback_lead_events;

-- Ook eventuele andere policies op deze drie tabellen verwijderen: alleen de
-- gecontroleerde backend met service_role gebruikt de eigen bb_admin_session.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('buyback_admin_users', 'buyback_admin_sessions', 'buyback_lead_events')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
COMMIT;

-- Geen sessies of wachtwoorden aangepast. Sessies intrekken en resets zijn
-- afzonderlijke incidentresponsacties na beoordeling en goedkeuring.
