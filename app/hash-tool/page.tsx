// app/hash-tool/page.tsx
"use client";

import { useState } from "react";
import bcrypt from "bcryptjs";

export default function HashToolPage() {
  const [password, setPassword] = useState("");
  const [hash, setHash] = useState("");
  const [rounds, setRounds] = useState(12);

  function generateHash() {
    if (!password) {
      alert("Geef eerst een wachtwoord in.");
      return;
    }

    try {
      const cost = Number(rounds) || 12;
      const h = bcrypt.hashSync(password, cost);
      setHash(h);
    } catch (e) {
      console.error(e);
      alert("Er ging iets mis bij het hashen.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-5 shadow-md space-y-4">
        <h1 className="text-lg font-semibold">Admin wachtwoord-hash generator</h1>

        <p className="text-xs text-gray-500">
          Deze pagina draait volledig lokaal in je browser en gebruikt
          <code> bcryptjs </code> om een hash te maken. Kopieer de hash naar
          <code> buyback_admin_users.password_hash </code> in Supabase.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Wachtwoord</span>
          <input
            type="password"
            className="bb-input h-9 text-sm px-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">bcrypt rounds (cost)</span>
          <input
            type="number"
            className="bb-input h-9 text-sm px-2 w-24"
            min={8}
            max={14}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value) || 12)}
          />
          <span className="text-xs text-gray-500">
            Standaard = 12 (veilig en snel).
          </span>
        </label>

        <button
          type="button"
          onClick={generateHash}
          className="bb-btn primary h-9 px-4 text-sm"
        >
          Genereer bcrypt-hash
        </button>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Resultaat</span>
          <textarea
            className="bb-input text-xs px-2 py-2 font-mono break-all"
            rows={3}
            value={hash}
            readOnly
          />
        </label>

        <p className="text-[11px] text-gray-400">
          Tip: gebruik deze tool even om de eerste admin-hash te maken en verwijder hem
          daarna uit de code, of laat hem staan voor intern beheer.
        </p>
      </div>
    </div>
  );
}
