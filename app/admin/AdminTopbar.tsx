'use server';

import { cookies } from 'next/headers';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

export async function logoutAction() {
  const supabase = createServerActionClient({ cookies });

  // Supabase sessie ongeldig maken
  await supabase.auth.signOut();

  // Eventueel cookies opruimen / extra cleanup hier

  // Terug naar login of home
  redirect('/admin/login');
}
