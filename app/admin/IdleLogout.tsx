// app/admin/IdleLogout.tsx
'use client';

import { useEffect, useRef } from 'react';
import { logoutAction } from './logout/actions';

type Props = {
  timeoutMs: number; // bv. 15 * 60 * 1000
};

export default function IdleLogout({ timeoutMs }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(async () => {
      const result = await logoutAction();
      if (result?.success) {
        window.location.href = '/admin/login';
      }
    }, timeoutMs);
  }

  useEffect(() => {
    resetTimer();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'visibilitychange'];

    const handler = () => {
      if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };

    events.forEach((e) => window.addEventListener(e, handler));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [timeoutMs]);

  return null;
}
