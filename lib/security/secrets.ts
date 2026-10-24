import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

// Hash both inputs so timingSafeEqual always compares buffers of identical size.
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith('Bearer ')) return false;
  const supplied = header.slice(7);
  if (!supplied || supplied.length > 4096) return false;
  return timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(secret).digest());
}
