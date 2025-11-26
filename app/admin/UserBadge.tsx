// app/admin/UserBadge.tsx
"use client";

import type { AdminUser } from "@/lib/getCurrentAdminUser";

type Props = {
  user: AdminUser | null;
};

export default function UserBadge({ user }: Props) {
  if (!user) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
          👤
        </span>
        <span className="italic">Niet ingelogd</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-700">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
        👤
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-medium break-all">{user.email}</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          {user.role}
        </span>
      </div>
    </div>
  );
}
