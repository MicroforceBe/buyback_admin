//app/admin/settings/users/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import {
  AdminRole,
  PermissionsMap,
  hasPermission,
  isRootAdminEmail,
} from '@/lib/adminPermissions';
import bcrypt from 'bcryptjs';

type SaveAdminUserInput = {
  email: string;
  role: AdminRole;
  permissions: PermissionsMap;
  password?: string;
  password_confirm?: string;
};

function isStrongPassword(pw: string): boolean {
  if (pw.length < 12) return false;
  if (!/[a-z]/.test(pw)) return false;
  if (!/[A-Z]/.test(pw)) return false;
  if (!/[0-9]/.test(pw)) return false;
  return true;
}

function normalizePermissions(
  perms: Partial<PermissionsMap> | PermissionsMap | null | undefined
): PermissionsMap {
  const base: PermissionsMap = {
    dashboard:   { read: false, write: false },
    leads:       { read: false, write: false },
    catalog:     { read: false, write: false },
    multipliers: { read: false, write: false },
    uploads:     { read: false, write: false },
    settings:    { read: false, write: false },
  };

  return {
    dashboard: {
      ...base.dashboard,
      ...(perms?.dashboard ?? {}),
    },
    leads: {
      ...base.leads,
      ...(perms?.leads ?? {}),
    },
    catalog: {
      ...base.catalog,
      ...(perms?.catalog ?? {}),
    },
    multipliers: {
      ...base.multipliers,
      ...(perms?.multipliers ?? {}),
    },
    uploads: {
      ...base.uploads,
      ...(perms?.uploads ?? {}),
    },
    settings: {
      ...base.settings,
      ...(perms?.settings ?? {}),
    },
  };
}

export async function saveAdminUserAction(input: SaveAdminUserInput) {
  console.log('[saveAdminUserAction] START', JSON.stringify(input, null, 2));

  const current = await getCurrentAdminUser();
  console.log('[saveAdminUserAction] current user', current?.email);

  // Alleen iemand met settings:write mag userrechten bijwerken
  if (!hasPermission(current, 'settings', 'write')) {
    console.error('[saveAdminUserAction] forbidden, no settings:write');
    throw new Error('Forbidden: je hebt geen rechten om users te beheren.');
  }

  const email = input.email.toLowerCase().trim();
  if (!email) throw new Error('Email is verplicht.');

  // Je mag jezelf niet "downgraden" als je root admin bent
  if (current && isRootAdminEmail(current.email) && current.email === email) {
    console.log('[saveAdminUserAction] normalize root admin rights');
    // Root admin blijft admin; root admin krijgt altijd full rights.
    input.role = 'admin';
    input.permissions = {
      dashboard:   { read: true, write: true },
      leads:       { read: true, write: true },
      catalog:     { read: true, write: true },
      multipliers: { read: true, write: true },
      uploads:     { read: true, write: true },
      settings:    { read: true, write: true },
    };
  }

  // Permissions altijd normaliseren naar een volledige PermissionsMap
  const safePermissions = normalizePermissions(input.permissions);
  console.log('[saveAdminUserAction] safePermissions', safePermissions);

  // Wachtwoordverwerking (optioneel)
  const rawPassword = (input.password ?? '').trim();
  const rawConfirm = (input.password_confirm ?? '').trim();
  let password_hash: string | undefined;

  if (rawPassword || rawConfirm) {
    console.log('[saveAdminUserAction] password flow triggered');
    if (rawPassword !== rawConfirm) {
      throw new Error('Wachtwoorden komen niet overeen.');
    }
    if (!isStrongPassword(rawPassword)) {
      throw new Error(
        'Wachtwoord is te zwak. Minstens 12 tekens, met hoofdletter, kleine letter en cijfer.'
      );
    }
    password_hash = await bcrypt.hash(rawPassword, 12);
  }

  const payload: any = {
    email,
    role: input.role,
    permissions: safePermissions,
  };

  if (password_hash) {
    payload.password_hash = password_hash;
  }

  console.log('[saveAdminUserAction] UPSERT payload', payload);

  const { error } = await supabaseAdmin
    .from('buyback_admin_users')
    .upsert(payload, { onConflict: 'email' });

  if (error) {
    console.error('[saveAdminUserAction] supabase error', error);
    throw new Error('Kon userrechten niet opslaan.');
  }

  console.log('[saveAdminUserAction] SUCCESS, revalidating /admin/settings');
  revalidatePath('/admin/settings');
}

export async function deleteAdminUserAction(email: string) {
  const current = await getCurrentAdminUser();

  if (!hasPermission(current, 'settings', 'write')) {
    throw new Error('Forbidden: je hebt geen rechten om users te beheren.');
  }

  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  // Root admin mag niet verwijderd worden
  if (isRootAdminEmail(normalized)) {
    throw new Error('Root admin kan niet verwijderd worden.');
  }

  const { error } = await supabaseAdmin
    .from('buyback_admin_users')
    .delete()
    .eq('email', normalized);

  if (error) {
    console.error('[deleteAdminUserAction] error', error);
    throw new Error('Kon user niet verwijderen.');
  }

  revalidatePath('/admin/settings');
}
