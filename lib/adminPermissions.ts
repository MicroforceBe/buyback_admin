// lib/adminPermissions.ts

/** Rol van een admin-user in de buyback admin */
export type AdminRole = "admin" | "user";

/** Alle features / secties waarvoor we rechten beheren */
export type AdminFeature =
  | "dashboard"
  | "leads"
  | "catalog"
  | "multipliers"
  | "uploads"
  | "settings";

/** Alias voor featuresleutel, handig in UI-componenten */
export type FeatureKey = AdminFeature;

/** Lees / schrijf */
export type PermissionMode = "read" | "write";

/**
 * Volledige permissiemap zoals we die logisch willen gebruiken in de app:
 * per feature een object met read/write (optioneel, want admins krijgen default alles).
 */
export type AdminPermissions = {
  [K in AdminFeature]?: {
    read?: boolean;
    write?: boolean;
  };
};

/**
 * Strakkere variant die de UI vaak gebruikt: elke feature aanwezig,
 * met expliciete booleans. Je kunt van AdminPermissions → PermissionsMap
 * mappen door default false toe te passen.
 */
export type PermissionsMap = {
  [K in AdminFeature]: {
    read: boolean;
    write: boolean;
  };
};

/** Minimale shape die `hasPermission` nodig heeft */
type AnyAdminUser = {
  role: AdminRole;
  permissions?: AdminPermissions | null;
};

/**
 * Centrale helper om permissies te checken.
 * - Admin → altijd true
 * - User → kijkt naar permissions[feature][mode]
 */
export function hasPermission(
  user: AnyAdminUser | null | undefined,
  feature: AdminFeature,
  mode: PermissionMode
): boolean {
  if (!user) return false;

  // Admin → alles
  if (user.role === "admin") return true;

  const featurePerm = user.permissions?.[feature];
  if (!featurePerm) return false;

  const val = featurePerm[mode];
  return !!val;
}

