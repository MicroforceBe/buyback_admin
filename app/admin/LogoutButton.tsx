'use client';

import { useTransition } from 'react';

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      // Simpele variant: naar loginpagina sturen.
      // Later kun je dit vervangen door een echte server action die de sessie ongeldig maakt.
      window.location.href = '/admin/login';
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
