'use client';

import type {ReactNode} from 'react';
import {usePathname} from 'next/navigation';

// Shared layouts can survive a redirect after the session has expired.
// The login route must never display an old authenticated layout.
// This only controls presentation; server-side access checks remain required.
export default function AdminChrome({children,loginContent}:{children:ReactNode;loginContent:ReactNode}){
  const pathname=usePathname();
  return <>{pathname==='/admin/login'?loginContent:children}</>;
}
