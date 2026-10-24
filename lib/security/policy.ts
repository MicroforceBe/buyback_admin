import type { AdminFeature, PermissionMode } from '@/lib/adminPermissions';

type Principal = {
  role: string;
  permissions?: Partial<Record<AdminFeature, { read?: boolean; write?: boolean }>> | null;
};

export function permits(user: Principal | null, feature: AdminFeature, mode: PermissionMode, adminOnly = false): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (adminOnly || user.role !== 'user') return false;
  const permission = user.permissions?.[feature];
  return permission?.read === true && (mode === 'read' || permission.write === true);
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    const candidate = new URL(origin);
    return candidate.origin === origin && candidate.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function validSessionTime(expiresAt: unknown, revokedAt: unknown, now = Date.now()): boolean {
  if (revokedAt || typeof expiresAt !== 'string') return false;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > now;
}
