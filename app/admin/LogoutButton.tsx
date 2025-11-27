// app/admin/LogoutButton.tsx
'use client';

import { useTransition } from 'react';
import { logoutAction } from './logout/actions';

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      const result = await logoutAction();
      if (result?.success) {
        // Na succesvolle logout naar loginpagina
        window.location.href = '/admin/login';
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="px-3 py-1 border rounded text-sm"
    >
      {isPending ? 'Afmelden…' : 'Afmelden'}
    </button>
  );
}
