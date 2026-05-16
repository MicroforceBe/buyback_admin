// app/admin/diagnostics/[id]/WebDiagnosticsQr.tsx

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function WebDiagnosticsQr({
  url,
}: {
  url: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    QRCode.toDataURL(url)
      .then(setSrc)
      .catch(console.error);
  }, [url]);

  if (!src) {
    return null;
  }

  return (
    <div className="rounded border p-4">
      <h2 className="mb-3 font-semibold">
        Open op iPhone
      </h2>

      <div className="flex flex-col items-center gap-3">
        <img
          src={src}
          alt="QR code"
          className="h-56 w-56"
        />

        <div className="text-center text-sm text-gray-500 break-all">
          {url}
        </div>
      </div>
    </div>
  );
}
