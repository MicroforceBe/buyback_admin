// app/admin/settings/SettingsForm.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Settings = {
  brand_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_disclaimer: string | null;
};

type Props = {
  initialSettings: Settings;
};

export default function SettingsForm({ initialSettings }: Props) {
  const [brandName, setBrandName] = useState(initialSettings.brand_name ?? "");
  const [brandColor, setBrandColor] = useState(initialSettings.brand_color ?? "#0ea5e9");
  const [logoUrl, setLogoUrl] = useState<string | null>(initialSettings.logo_url ?? null);
  const [disclaimer, setDisclaimer] = useState(initialSettings.email_disclaimer ?? "");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // kleine helper om meldingen kort te tonen
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const brandPreviewStyle = useMemo(
    () => ({ background: brandColor || "#0ea5e9" }),
    [brandColor]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName || null,
          brand_color: brandColor || null,
          logo_url: logoUrl || null,
          email_disclaimer: disclaimer || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Opslaan mislukt");
      setMsg("Instellingen bewaard ✅");
    } catch (err: any) {
      setMsg(`Fout bij bewaren: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/settings/uploadLogo", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.logo_url) {
        throw new Error(json?.error || "Logo upload mislukt");
      }
      setLogoUrl(json.logo_url);
      setMsg("Logo geüpload ✅ (niet vergeten te bewaren)");
    } catch (err: any) {
      setMsg(`Fout bij upload: ${err?.message || err}`);
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (f) void handleUploadLogo(f);
  }

  function removeLogo() {
    setLogoUrl(null);
    setMsg("Logo verwijderd (niet vergeten te bewaren)");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Merknaam */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm text-gray-700">
          Merknaam
          <input
            className="bb-input h-9 text-sm px-2 py-1 w-full mt-1"
            placeholder="Microforce Buyback"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
          />
        </label>

        <label className="text-sm text-gray-700">
          Merk-kleur
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              className="h-9 w-12 border rounded"
              value={brandColor || "#0ea5e9"}
              onChange={(e) => setBrandColor(e.target.value)}
            />
            <input
              className="bb-input h-9 text-sm px-2 py-1 w-full"
              placeholder="#0ea5e9"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
            />
          </div>
        </label>
      </div>

      {/* Logo upload / preview */}
      <div className="space-y-2">
        <div className="text-sm text-gray-700">Logo</div>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-10 w-auto object-contain border rounded bg-white p-1"
              />
              <button type="button" className="bb-btn subtle h-9 text-xs px-3" onClick={removeLogo}>
                Verwijder
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-500">Nog geen logo ingesteld</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="text-xs"
          />
          {uploading && <span className="text-xs text-gray-500">Uploaden…</span>}
        </div>
        <div className="text-xs text-gray-500">
          Tip: transparante PNG of SVG, hoogte ~40px. Bestand wordt publiek opgeslagen in Supabase Storage bucket <code>branding</code>.
        </div>
      </div>

      {/* Disclaimer */}
      <div>
        <label className="text-sm text-gray-700">
          E-maildisclaimer (HTML of tekst)
          <textarea
            className="bb-input text-sm px-2 py-2 w-full mt-1 min-h-[120px]"
            placeholder="Bedrijfsgegevens / disclaimer…"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
          />
        </label>
        <div className="text-xs text-gray-500 mt-1">
          Je mag HTML gebruiken (links, adres-opmaak). Verschijnt onderaan elke bevestigingsmail.
        </div>
      </div>

      {/* Preview stripje kleur */}
      <div className="mt-2">
        <div className="text-xs text-gray-600 mb-1">Voorbeeld kleurbalk</div>
        <div className="h-2 rounded" style={brandPreviewStyle} />
      </div>

      {/* Opslaan */}
      <div className="flex items-center gap-3 pt-2">
        <button className="bb-btn primary h-9 text-sm px-4" type="submit" disabled={saving || uploading}>
          {saving ? "Bewaren…" : "Bewaren"}
        </button>
        {msg && <span className="text-sm text-gray-700">{msg}</span>}
      </div>
    </form>
  );
}
