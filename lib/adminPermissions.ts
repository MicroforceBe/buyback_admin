// lib/adminPermissions.ts

/** Rol van een admin-user in de buyback admin */
export type AdminRole = "admin" | "user";

/** Alle features / secties waarvoor we rechten beheren */
export type AdminFeature =
  | "dashboard"
  | "leads"
  | "leads_finalize"
  | "refurb"
  | "erp"
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

/** Centrale lijst van alle features, handig voor UI-loops e.d. */
export const ALL_FEATURES: AdminFeature[] = [
  "dashboard",
  "leads",
  "leads_finalize",
  "refurb",
  "erp",
  "catalog",
  "multipliers",
  "uploads",
  "settings",
];

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

/**
 * Bepaalt of een e-mailadres een "root admin" is.
 * Handig om bv. delete / role-change op de hoofdadmin te blokkeren.
 *
 * Gebruik een env-var met komma-gescheiden e-mails, bijvoorbeeld:
 * BUYBACK_ROOT_ADMINS=olivier@microforce.be,iemand@anders.be
 */
export function isRootAdminEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();

  if (!normalized) return false;

  const raw =
    process.env.BUYBACK_ROOT_ADMINS ||
    process.env.ROOT_ADMIN_EMAIL ||
    "";

  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) return false;

  return list.includes(normalized);
}
