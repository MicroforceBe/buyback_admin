// app/admin/refurb/statuses/ColorPickerField.tsx
"use client";

import * as React from "react";

type Props = {
  defaultValue?: string;
  compact?: boolean; // true voor in tabelrij (h-7), false voor "Nieuwe status" (h-8)
};

function normalizeHex(v: string) {
  const s = (v || "").trim();
  if (!s) return "#64748b";
  if (s.startsWith("#") && s.length === 7) return s;
  if (!s.startsWith("#") && s.length === 6) return `#${s}`;
  return s;
}

export default function ColorPickerField({ defaultValue, compact }: Props) {
  const initial = normalizeHex(defaultValue || "#64748b");
  const [color, setColor] = React.useState<string>(initial);

  // Als defaultValue wijzigt (bijv. andere rij), reset state
  React.useEffect(() => {
    setColor(normalizeHex(defaultValue || "#64748b"));
  }, [defaultValue]);

  const h = compact ? "h-7" : "h-8";
  const textClass = compact
    ? "bb-input h-7 text-[11px] px-1 w-full"
    : "bb-input h-8 text-xs px-2 w-full";

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex w-3 h-3 rounded-full border border-slate-300"
        style={{ background: color }}
        aria-hidden="true"
        title={color}
      />
      <input
        type="color"
        name="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className={`${h} w-10 p-0 border border-slate-200 rounded bg-white`}
        title="Kies kleur"
      />
      <input
        name="color_text"
        value={color}
        onChange={(e) => setColor(normalizeHex(e.target.value))}
        className={textClass}
        placeholder="#64748b"
        inputMode="text"
      />
    </div>
  );
}
