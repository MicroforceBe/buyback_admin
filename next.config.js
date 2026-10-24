/** @type {import('next').NextConfig} */
// TEST BRANCH ONLY. Never merge this configuration into the live main branch.
const TEST_REF = 'ekqmhexbabrwudetkfcm';
for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  const value = process.env[name];
  if (value && new URL(value).hostname !== `${TEST_REF}.supabase.co`) {
    throw new Error(`Test build refused: ${name} must point to the isolated test project.`);
  }
}
for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = process.env[name];
  if (!value) continue;
  const url = new URL(value);
  const direct = url.hostname === `db.${TEST_REF}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${TEST_REF}`;
  if (!direct && !pooler) throw new Error(`Test build refused: ${name} must point to the isolated test project.`);
}
const nextConfig = {};
module.exports = nextConfig;
