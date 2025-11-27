'use client';

import { useTransition } from 'react';
import { logoutAction } from './logout/actions';

type Props = {
  currentUserEmail: string | null;
};

export default function AdminTopbar({ currentUserEmail }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white">
      <div className="font-semibold">Buyback Admin</div>
      <div className="flex items-center gap-3 text-sm">
        {currentUserEmail && (
          <span className="text-gray-600">
            Ingelogd als <strong>{currentUserEmail}</strong>
          </span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="px-3 py-1 border rounded text-sm"
        >
          {isPending ? 'Afmelden...' : 'Afmelden'}
        </button>
      </div>
    </header>
  );
}
