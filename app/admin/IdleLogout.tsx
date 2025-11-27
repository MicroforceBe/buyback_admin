'use client';

import { useEffect, useRef } from 'react';
import { logoutAction } from './logout/actions';

type Props = {
  timeoutMs: number; // bv. 15 * 60 * 1000 voor 15 minuten
};

export default function IdleLogout({ timeoutMs }: Props) {
  const timerId = useRef<NodeJS.Timeout | null>(null);

  function resetTimer() {
    if (timerId.current) {
      clearTimeout(timerId.current);
    }
    timerId.current = setTimeout(() => {
      // Bij inactiviteit → uitloggen
      logoutAction();
    }, timeoutMs);
  }

  useEffect(() => {
    resetTimer();

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'visibilitychange'];

    const handler = () => {
      // Alleen resetten als tab zichtbaar is
      if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };

    events.forEach((event) => {
      window.addEventListener(event, handler);
    });

    return () => {
      if (timerId.current) clearTimeout(timerId.current);
      events.forEach((event) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [timeoutMs]);

  return null;
}
