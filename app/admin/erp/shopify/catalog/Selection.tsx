'use client';
// Select-all and the live count of selected products for the catalogue fix form.
import { useEffect, useRef, useState } from 'react';

const boxes = (el: HTMLElement | null) => [...(el?.closest('form')?.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=ids]') ?? [])];

/** Header checkbox: selects or clears every product on this page. */
export function SelectAll() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.closest('form');
    const sync = () => {
      const all = boxes(ref.current);
      const on = all.filter(b => b.checked).length;
      if (ref.current) { ref.current.checked = all.length > 0 && on === all.length; ref.current.indeterminate = on > 0 && on < all.length; }
    };
    form?.addEventListener('change', sync);
    return () => form?.removeEventListener('change', sync);
  }, []);
  return <input ref={ref} type="checkbox" aria-label="Alles op deze pagina selecteren" onChange={e => { for (const b of boxes(ref.current)) b.checked = e.currentTarget.checked; ref.current?.closest('form')?.dispatchEvent(new Event('change', { bubbles: true })); }} />;
}

/** "N geselecteerd" plus buttons to select or clear the whole page. */
export function SelectionCount({ max }: { max: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const form = ref.current?.closest('form');
    const sync = () => { const all = boxes(ref.current); setTotal(all.length); setCount(all.filter(b => b.checked).length); };
    sync();
    form?.addEventListener('change', sync);
    return () => form?.removeEventListener('change', sync);
  }, []);
  const setAll = (on: boolean) => { for (const b of boxes(ref.current)) b.checked = on; ref.current?.closest('form')?.dispatchEvent(new Event('change', { bubbles: true })); };
  return (
    <span ref={ref} className="flex flex-wrap items-center gap-2">
      <b className={count > max ? 'text-red-700' : ''}>{count} geselecteerd</b>
      <button type="button" onClick={() => setAll(true)} className="rounded border px-2 py-0.5 text-xs hover:bg-white">Alles op deze pagina ({total})</button>
      <button type="button" onClick={() => setAll(false)} className="rounded border px-2 py-0.5 text-xs hover:bg-white">Niets</button>
      {count > max && <span className="text-xs text-red-700">maximaal {max} per keer</span>}
    </span>
  );
}
