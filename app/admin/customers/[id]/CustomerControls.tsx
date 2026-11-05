'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkLeadToCustomer, setCustomerArchived } from '../actions';
import styles from '../customers.module.css';

export function ArchiveButton({ id, version, archived }: { id: string; version: number; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run() {
    if (!archived && !window.confirm('Klant archiveren? De klant verdwijnt uit de zoekresultaten, maar alle historiek blijft bewaard en je kunt de klant later terugzetten.')) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setCustomerArchived({ id, version, archived: !archived });
        if (!result.ok) setError(result.error); else router.refresh();
      } catch { setError('Niet gelukt. Controleer je sessie en probeer opnieuw.'); }
    });
  }
  return (
    <>
      <button type="button" className={archived ? styles.secondary : styles.danger} disabled={pending} onClick={run}>
        {pending ? 'Bezig…' : archived ? 'Klant terugzetten' : 'Klant archiveren'}
      </button>
      {error && <span role="alert" className={styles.inlineError}>{error}</span>}
    </>
  );
}

export function LinkLeadButton({ customerId, leadId }: { customerId: string; leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await linkLeadToCustomer({ customerId, leadId });
        if (!result.ok) setError(result.error); else router.refresh();
      } catch { setError('Niet gelukt. Probeer opnieuw.'); }
    });
  }
  return (
    <span>
      <button type="button" className={styles.secondary} style={{ padding: '6px 11px' }} disabled={pending} onClick={run}>{pending ? 'Koppelen…' : 'Koppelen'}</button>
      {error && <span role="alert" className={styles.inlineError}> {error}</span>}
    </span>
  );
}
