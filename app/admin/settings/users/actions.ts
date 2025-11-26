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

type SaveAdminUserInput = {
  email: string;
  role: AdminRole;
  permissions: PermissionsMap;
};

export async function saveAdminUserAction(input: SaveAdminUserInput) {
  const current = await getCurrentAdminUser();

  // Alleen iemand met settings:write mag userrechten bijwerken
  if (!hasPermission(current, 'settings', 'write')) {
    throw new Error('Forbidden: je hebt geen rechten om users te beheren.');
  }

  const email = input.email.toLowerCase().trim();
  if (!email) throw new Error('Email is verplicht.');

  // Je mag jezelf niet "downgraden" als je root admin bent
  if (current && isRootAdminEmail(current.email) && current.email === email) {
  // Root admin blijft admin; root admin krijgt altijd full rights.
    input.role = "admin";
    input.permissions = {
      dashboard:   { read: true, write: true },
      leads:       { read: true, write: true },
      catalog:     { read: true, write: true },
      multipliers: { read: true, write: true },
      uploads:     { read: true, write: true },
      settings:    { read: true, write: true },
    };
  }

  const { error } = await supabaseAdmin
    .from('buyback_admin_users')
    .upsert(
      {
        email,
        role: input.role,
        permissions: input.permissions,
      },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('[saveAdminUserAction] error', error);
    throw new Error('Kon userrechten niet opslaan.');
  }

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
