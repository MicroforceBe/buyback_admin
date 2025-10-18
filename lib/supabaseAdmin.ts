// Server-side Supabase client met service role (RLS bypass in admin)
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,                // ⬅️ géén NEXT_PUBLIC_
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // ⬅️ service role
  { auth: { persistSession: false } }
);
