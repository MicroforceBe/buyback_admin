"use client";

import { useFormStatus } from "react-dom";

export function InlineSaveButton({ label = "💾", saving = "Opslaan…" }: { label?: string; saving?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`bb-btn subtle ${pending ? "opacity-70 cursor-wait" : ""}`} type="submit" title="Opslaan" disabled={pending}>
      {pending ? saving : label}
    </button>
  );
}
