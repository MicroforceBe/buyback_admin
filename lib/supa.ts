import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role, server-side only

export function supa() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}
