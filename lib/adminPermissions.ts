export type AdminFeature =
  | "dashboard"
  | "leads"
  | "catalog"
  | "multipliers"
  | "uploads"
  | "settings";

export type PermissionMode = "read" | "write";

type AnyAdminUser = {
  role: "admin" | "user";
  permissions?: {
    [K in AdminFeature]?: {
      read?: boolean;
      write?: boolean;
    };
  } | null;
};

export function hasPermission(
  user: AnyAdminUser | null | undefined,
  feature: AdminFeature,
  mode: PermissionMode
): boolean {
  if (!user) return false;

  // Admin → altijd alles
  if (user.role === "admin") return true;

  const featurePerm = user.permissions?.[feature];
  if (!featurePerm) return false;

  const val = featurePerm[mode];
  return !!val;
}
