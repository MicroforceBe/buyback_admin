// Frozen from MicroforceBe/nextjs-buyback b76077fed9b02df9701e3fb1f58c8eca06fc4cb4 FlowClient.tsx.
// Used only to compare the new server calculator with the existing client behavior.
export function widgetQuote(base: number, questions: any, answers: any, keys: string[]) {
 const data = {questions};
 const capacity = 128;
 const capacities = [{capacity_gb:128,price_cents:base}];
 const orderedQuestions = keys.map(key=>({key}));
 const useMemo = (fn: any, deps: any[]) => fn();
  function toNumber(x: any): number {
    if (typeof x === 'number' && isFinite(x)) return x;
    if (typeof x === 'string') {
      const s = x.trim().replace(',', '.');
      const pct = s.endsWith('%') ? Number(s.slice(0, -1)) : NaN;
      if (!isNaN(pct)) return pct; // laat "-10%" als -10 door; caller beslist interpretatie
      const n = Number(s);
      if (isFinite(n)) return n;
    }
    return 0;
  }

  /** Percent normaliseren → altijd een factor (bv. 0.9 of 1.05) */
  function normalizePercentFactor(opt: any): number {
    // mogelijke velden: value, percent, value_percent, multiplier
    const raw =
      opt?.multiplier ??
      opt?.value_percent ??
      opt?.percent ??
      opt?.value ??
      0;

    const n = toNumber(raw);

    // Vorm 1: string met "%" → interpreteer als procentpunten
    if (typeof raw === 'string' && raw.trim().endsWith('%')) {
      return 1 + n / 100; // bv. "-10%" → 0.9
    }

    // Vorm 2: procentpunten als getal (bv. -10 of 5)
    if (Math.abs(n) >= 2) {
      return 1 + n / 100; // -10 → 0.9, 5 → 1.05
    }

    // Vorm 3: multiplicatieve factor (0.95, 1.05, …)
    if (n !== 0) return n;

    // fallback
    return 1;
  }

  /** Fixed normaliseren → delta in centen (integer) */
  function normalizeFixedDeltaCents(opt: any): number {
    // Hard-signalen eerst
    if (isFinite(opt?.value_cents))  return Math.round(Number(opt.value_cents));
    if (isFinite(opt?.amount_cents)) return Math.round(Number(opt.amount_cents));
    if (isFinite(opt?.value_eur))    return Math.round(Number(opt.value_eur) * 100);
    if (isFinite(opt?.amount_eur))   return Math.round(Number(opt.amount_eur) * 100);

    // Eventuele unit-hint
    const unit = String(opt?.unit ?? '').toLowerCase(); // 'eur' | '€' | 'cents' | 'cent'

    // Generieke value/amount
    const raw = (opt?.value ?? opt?.amount ?? 0);
    const n = (typeof raw === 'string')
      ? Number(raw.trim().replace(',', '.'))
      : Number(raw);

    if (!isFinite(n) || n === 0) return 0;

    if (unit === 'cents' || unit === 'cent') {
      return Math.round(n);
    }
    if (unit === 'eur' || unit === '€') {
      return Math.round(n * 100);
    }

    // Heuristiek zonder unit:
    // - kleine absolute waarden (≤ 200) interpreteren we als € (dus -10 → -1000c)
    //   dit dekt de meeste “-10 euro” cases in jullie data.
    if (Math.abs(n) <= 200) {
      return Math.round(n * 100);
    }

    // Anders aannemen dat het al centen zijn
    return Math.round(n);
  }

  // Prijsberekening mèt robuuste multipliers
  const result = useMemo(() => {
    if (!data || capacity == null) return { baseCents: 0, finalCents: 0 };
    const cap = capacities.find((c) => c.capacity_gb === capacity);
    const baseCents = cap?.price_cents ?? 0;

    let price = baseCents;

    for (const { key } of orderedQuestions) {
      const selectedKey = answers[key];
      if (!selectedKey) continue;

      const block: any = (data as any).questions?.[key];
      const opts: any[] = block?.options || [];
      const opt = opts.find((o) => o.key === selectedKey);
      if (!opt || opt.active === false) continue;

      const t = String(opt.type ?? opt.kind ?? 'fixed').toLowerCase();

      if (t === 'percent' || t === 'percentage') {
        const factor = normalizePercentFactor(opt);
        price = Math.round(price * factor);
      } else if (t === 'fixed' || t === 'amount' || t === 'delta') {
        const delta = normalizeFixedDeltaCents(opt);
        price = Math.max(0, price + delta);
      } else {
        // Onbekend type → negeren (of loggen)
      }
    }

    // afronden op €5
    price = Math.round(price / 500) * 500;
    return { baseCents, finalCents: price };
  }, [data, capacity, answers, orderedQuestions, capacities]);


 return result;
}

