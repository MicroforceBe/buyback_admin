import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { AdminUser, PermissionsMap, isRootAdminEmail } from './adminPermissions';
import { isRootAdminEmail as isRootAdminEmailFn } from './adminPermissions';

type RawAdminUserRow = {
  email: string;
  role: 'admin' | 'user';
  permissions: PermissionsMap | null;
};

export async function getCurrentAdminUser(): Promise<AdminUser | null> {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return null;
  }

  const email = user.email.toLowerCase();

  // Fetch bijhorende rij in buyback_admin_users
  const { data, error } = await supabase
    .from('buyback_admin_users')
    .select('email, role, permissions')
    .eq('email', email)
    .maybeSingle();

  const row = data as RawAdminUserRow | null;
  
  if (error) {
    console.error('[getCurrentAdminUser] error', error);
    return null;
  }

  // Als er een rij is → gebruik die
  if (data) {
    return {
      email: data.email,
      role: data.role,
      permissions: (data.permissions ?? {}) as PermissionsMap,
    };
  }

  // Geen rij in de tabel:
  // - als dit de root admin is, geef volledige adminrechten
  if (isRootAdminEmailFn(email)) {
    return {
      email,
      role: 'admin',
      permissions: {},
    };
  }

  // Anders: geen toegang tot admin
  return null;
}
