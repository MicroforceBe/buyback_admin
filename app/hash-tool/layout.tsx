import type { ReactNode } from 'react';
import { requirePageAccess } from '@/lib/security/access';
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requirePageAccess('settings', true);
  return <>{children}</>;
}
