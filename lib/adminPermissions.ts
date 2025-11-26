export type FeatureKey =
  | 'catalog'
  | 'leads'
  | 'multipliers'
  | 'settings';

export type PermissionMode = 'read' | 'write';

export type FeaturePermission = {
  read: boolean;
  write: boolean;
};

export type PermissionsMap = {
  [K in FeatureKey]?: FeaturePermission;
};

export type AdminRole = 'admin' | 'user';

export type AdminUser = {
  email: string;
  role: AdminRole;
  permissions: PermissionsMap;
};

/**
 * Root admin e-mail uit env.
 * Deze user mag ALLES, ongeacht wat er in de DB staat.
 */
export function isRootAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const root = process.env.BUYBACK_ROOT_ADMIN_EMAIL;
  if (!root) return false;
  return email.toLowerCase() === root.toLowerCase();
}

/**
 * Check of een user een bepaalde permissie heeft.
 * - root admin ⇒ altijd true
 * - role 'admin' ⇒ altijd true
 * - role 'user' ⇒ check JSON permissions[feature][mode]
 */
export function hasPermission(
  user: AdminUser | null,
  feature: FeatureKey,
  mode: PermissionMode
): boolean {
  if (!user) return false;

  if (isRootAdminEmail(user.email)) return true;
  if (user.role === 'admin') return true;

  const featurePerm = user.permissions?.[feature];
  if (!featurePerm) return false;

  return !!featurePerm[mode];
}

/** Handige lijst voor UI (Users-tab) */
export const ALL_FEATURES: FeatureKey[] = [
  'catalog',
  'leads',
  'multipliers',
  'settings',
];
