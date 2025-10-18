import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY; // werkt met beide env-namen

if (!URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SERVICE) throw new Error('Missing SUPABASE service role key');

export const supabaseAdmin = createClient(URL, SERVICE, {
  auth: { persistSession: false },
});
