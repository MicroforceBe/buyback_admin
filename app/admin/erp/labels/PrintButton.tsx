// app/admin/erp/labels/PrintButton.tsx
"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
    >
      Print label
    </button>
  );
}
