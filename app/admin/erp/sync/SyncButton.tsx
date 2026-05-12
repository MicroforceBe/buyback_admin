// app/admin/erp/sync/SyncButton.tsx
"use client";

import { useFormStatus } from "react-dom";

export default function SyncButton() {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="bb-btn bb-btn-primary text-sm disabled:opacity-60"
      >
        {pending ? "Sync bezig..." : "Start sync"}
      </button>

      {pending && (
        <div className="w-full min-w-[260px]">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>ERP bestand downloaden en verwerken...</span>
            <span>Even geduld</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-900" />
          </div>

          <div className="mt-2 text-xs text-slate-500">
            De XLSX wordt via FTP opgehaald en daarna in bulk gesynchroniseerd.
          </div>
        </div>
      )}
    </div>
  );
}
