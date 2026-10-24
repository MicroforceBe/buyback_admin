-- VOORSTEL. Eerst controleren of andere apps de catalog-bucket gebruiken.
-- De onderzochte admin uploadt via gecontroleerde serveracties met service_role.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY IF EXISTS "Auth write access to catalog" ON storage.objects;
-- Publieke leespolicy blijft staan. Geen bestanden of bucket-instellingen wijzigen.
COMMIT;
