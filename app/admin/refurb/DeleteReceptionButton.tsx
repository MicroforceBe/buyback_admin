// app/admin/refurb/DeleteReceptionButton.tsx
"use client";

import { useTransition } from "react";
import { deleteRefurbReception } from "./actions";

export default function DeleteReceptionButton({
  id,
  label = "🗑️",
  className = "bb-btn text-[11px] px-2 h-7 border border-red-200 text-red-700",
}: {
  id: string;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      title="Verwijder receptie"
      onClick={() => {
        const ok = window.confirm(
          "Deze receptie verwijderen?\n\n⚠️ Dit verwijdert ook alle items in de receptie."
        );
        if (!ok) return;

        start(async () => {
          await deleteRefurbReception(id);
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
