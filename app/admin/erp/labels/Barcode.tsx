// app/admin/erp/labels/Barcode.tsx
"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;

    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 1,
      height: 24,
      displayValue: false,
      margin: 0,
    });
  }, [value]);

  if (!value) return null;

  return <svg ref={ref} className="label-barcode" />;
}
