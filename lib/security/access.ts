import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import type { AdminFeature, PermissionMode } from '@/lib/adminPermissions';
import { permits, sameOrigin } from './policy';
import { bearerMatches } from './secrets';

export async function requireAccess(feature: AdminFeature, mode: PermissionMode, adminOnly = false) {
  const user = await getCurrentAdminUser();
  if (!user) redirect('/admin/login');
  if (!permits(user, feature, mode, adminOnly)) throw new Error('Geen toegang tot deze handeling.');
  return user;
}

export async function requirePageAccess(feature: AdminFeature, adminOnly = false) {
  const user = await getCurrentAdminUser();
  if (!user) redirect('/admin/login');
  if (!permits(user, feature, 'read', adminOnly)) redirect('/admin/access-denied');
  return user;
}

export async function apiAccess(request: Request, feature: AdminFeature, mode: PermissionMode, adminOnly = false) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const user = await getCurrentAdminUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!permits(user, feature, mode, adminOnly)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return null;
  } catch {
    return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 });
  }
}

// A bridge token is a server/device credential, never a NEXT_PUBLIC variable or a URL parameter.
// Without a configured bridge token, browser users must pass the normal permission checks.
export async function diagnosticAccess(request: Request, mode: PermissionMode) {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (bearerMatches(authorization, process.env.DIAGNOSTICS_BRIDGE_SECRET)) return null;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return apiAccess(request, 'refurb', mode);
}

// Used by the login action as well as Next's built-in Origin/Host protection.
export async function requireLoginOrigin() {
  const incoming = await headers();
  const origin = incoming.get('origin');
  const host = incoming.get('host');
  if (!origin || !host) throw new Error('Ongeldige aanmeldingsaanvraag.');
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.host !== host || url.origin !== origin) throw new Error();
  } catch {
    throw new Error('Ongeldige aanmeldingsaanvraag.');
  }
}


