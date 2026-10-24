// app/admin/settings/users/actions.ts
'use server';
import { requireAccess } from '@/lib/security/access';


import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import {
  AdminRole,
  PermissionsMap,
  hasPermission,
  isRootAdminEmail,
  ALL_FEATURES,
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
  // 🔧 Dynamisch normaliseren op basis van ALL_FEATURES
  // => nieuwe features zoals 'leads_finalize' worden automatisch meegenomen.
  return ALL_FEATURES.reduce((acc, feature) => {
    const incoming = perms?.[feature] ?? {};
    acc[feature] = {
      read: !!(incoming as any).read,
      write: !!(incoming as any).write,
    };
    return acc;
  }, {} as PermissionsMap);
}

type SaveAdminUserResult =
  | { success: true }
  | { success?: false; error: string; field?: 'email' | 'password' | 'global' };

export async function saveAdminUserAction(
  input: SaveAdminUserInput
): Promise<SaveAdminUserResult> {
  await requireAccess('settings', 'write', true);


  const current = await getCurrentAdminUser();

  // Alleen iemand met settings:write mag userrechten bijwerken
  if (!hasPermission(current, 'settings', 'write')) {
    console.error('[saveAdminUserAction] forbidden, no settings:write');
    return {
      error: 'Je hebt geen rechten om users te beheren.',
      field: 'global',
    };
  }

  const email = input.email.toLowerCase().trim();
  if (!email) {
    return { error: 'Email is verplicht.', field: 'email' };
  }

  // Je mag jezelf niet "downgraden" als je root admin bent
  if (current && isRootAdminEmail(current.email) && current.email === email) {

    // Root admin blijft admin; root admin krijgt altijd full rights.
    input.role = 'admin';
    input.permissions = ALL_FEATURES.reduce((acc, feature) => {
      acc[feature] = { read: true, write: true };
      return acc;
    }, {} as PermissionsMap);
  }

  // Permissions altijd normaliseren naar een volledige PermissionsMap
  const safePermissions = normalizePermissions(input.permissions);

  // Wachtwoordverwerking (optioneel)
  const rawPassword = (input.password ?? '').trim();
  const rawConfirm = (input.password_confirm ?? '').trim();
  let password_hash: string | undefined;

  if (rawPassword || rawConfirm) {

    if (rawPassword !== rawConfirm) {
      return {
        error: 'Wachtwoorden komen niet overeen.',
        field: 'password',
      };
    }
    if (!isStrongPassword(rawPassword)) {
      return {
        error:
          'Wachtwoord voldoet niet aan de regels: minstens 12 tekens, met hoofdletter, kleine letter en cijfer.',
        field: 'password',
      };
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


  const { error } = await supabaseAdmin
    .from('buyback_admin_users')
    .upsert(payload, { onConflict: 'email' });

  if (error) {
    console.error('[saveAdminUserAction] supabase error', error);
    return {
      error: 'Kon userrechten niet opslaan (databasefout).',
      field: 'global',
    };
  }


  revalidatePath('/admin/settings');
  return { success: true };
}

type DeleteAdminUserResult =
  | { success: true }
  | { success?: false; error: string; field?: 'global' };

export async function deleteAdminUserAction(
  email: string
): Promise<DeleteAdminUserResult> {
  await requireAccess('settings', 'write', true);

  const current = await getCurrentAdminUser();

  if (!hasPermission(current, 'settings', 'write')) {
    return {
      error: 'Je hebt geen rechten om users te beheren.',
      field: 'global',
    };
  }

  const normalized = email.toLowerCase().trim();
  if (!normalized) {
    return { success: true };
  }

  // Root admin mag niet verwijderd worden
  if (isRootAdminEmail(normalized)) {
    return {
      error: 'Root admin kan niet verwijderd worden.',
      field: 'global',
    };
  }

  const { error } = await supabaseAdmin
    .from('buyback_admin_users')
    .delete()
    .eq('email', normalized);

  if (error) {
    console.error('[deleteAdminUserAction] error', error);
    return {
      error: 'Kon user niet verwijderen.',
      field: 'global',
    };
  }

  revalidatePath('/admin/settings');
  return { success: true };
}

