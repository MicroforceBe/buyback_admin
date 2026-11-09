'use client';
// Submit button for server actions that take a while: while the form is being processed it is disabled
// (no double submit), shows a spinner and the pending text, and a moving bar with a hint underneath.
import { useFormStatus } from 'react-dom';

export default function PendingButton({ children, pendingText = 'Bezig…', hint = 'Even geduld, sluit deze pagina niet.', className = '', name, value, dark = false }: {
  children: React.ReactNode;
  pendingText?: string;
  /** Shown under the button while busy (e.g. how long it usually takes). */
  hint?: string;
  className?: string;
  name?: string;
  value?: string;
  /** For buttons on a dark background: light hint text. */
  dark?: boolean;
}) {
  const status = useFormStatus();
  // Several named buttons in one form: only the one that was clicked shows the progress; the others are only disabled.
  const mine = status.pending && (!name || status.data?.get(name) === (value ?? ''));
  const pending = mine;
  return (
    <span className="inline-flex flex-col gap-1 align-middle">
      <button type="submit" name={name} value={value} disabled={status.pending} aria-busy={pending} className={`${className} inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-80`}>
        {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {pending ? pendingText : children}
      </button>
      {pending && (
        <span role="status" className="block w-56">
          <span className={`relative block h-1.5 w-full overflow-hidden rounded-full ${dark ? 'bg-white/20' : 'bg-slate-200'}`}>
            <span className={`absolute inset-y-0 block w-1/3 rounded-full ${dark ? 'bg-white' : 'bg-slate-900'}`} style={{ animation: 'pending-slide 1.2s ease-in-out infinite' }} />
          </span>
          <span className={`mt-1 block text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</span>
          <style>{'@keyframes pending-slide{0%{left:-33%}100%{left:100%}}'}</style>
        </span>
      )}
    </span>
  );
}
