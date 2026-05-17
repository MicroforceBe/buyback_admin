"use client";

import { useEffect } from "react";

export default function StationsClient() {
  useEffect(() => {
    const interval = window.setInterval(() => {
      window.location.reload();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
