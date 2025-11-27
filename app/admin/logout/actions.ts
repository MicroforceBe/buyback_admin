// app/admin/logout/actions.ts
'use server';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function logoutAction(): Promise<{ success: boolean }> {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get('bb_admin_session')?.value;

  if (sessionToken) {
    // Sessierij in DB opruimen
    const { error } = await supabaseAdmin
      .from('buyback_admin_sessions')
      .delete()
      .eq('session_token', sessionToken);

    if (error) {
      console.error('[ADMIN_LOGOUT] failed to delete session:', error.message);
    }
  }

  // Cookie wissen
  cookieStore.set('bb_admin_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });

  // Geen redirect hier – die doen we client-side
  return { success: true };
}
