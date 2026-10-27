// Server-side quote validation for the current nextjs-buyback widget contract.
export class LeadPriceError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number = 400) {
    super(status === 503 ? 'Prijsconfiguratie tijdelijk niet beschikbaar.' : 'Prijs of toestelantwoorden ongeldig. Vernieuw de offerte en probeer opnieuw.');
    this.code = code;
    this.status = status;
  }
}
const invalid = () => new LeadPriceError('INVALID_QUOTE');
const configError = () => new LeadPriceError('QUOTE_UNAVAILABLE', 503);
const preferredOrder = ['Functionaliteit','Scherm','Behuizing','Batterij','functional','screen','housing','battery','eu_model','icloud','status'];
const MAX_CENTS = 2147483647;
function renderAnswerSummary(rows: Array<{ question: string; answer: string }>): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return '<h3 style="margin:18px 0 6px;font-size:14px;">Vragen en antwoorden</h3>' +
    '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;">' +
    '<tbody>' + rows.map(row => '<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;width:45%;color:#6b7280;">' +
      escape(row.question) + '</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">' +
      escape(row.answer) + '</td></tr>').join('') + '</tbody></table>';
}
function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;
}
function object(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function parseObject(value: any): Record<string, any> {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw configError(); }
  }
  if (!object(value)) throw configError();
  return value;
}
function normalizeRules(value: any): { questions: Record<string, any>; order?: string[] } {
  const root = parseObject(value);
  const meta = new Set(['questions','tips','voucher_help','question_order']);
  const questions = root.questions == null
    ? Object.fromEntries(Object.entries(root).filter(([key]) => !meta.has(key)))
    : parseObject(root.questions);
  const order = root.question_order;
  if (order != null && (!Array.isArray(order) || order.some((key: any) => typeof key !== 'string'))) throw configError();
  return { questions, order };
}
function numeric(value: any): number {
  const result = typeof value === 'number' ? value : typeof value === 'string' && value.trim()
    ? Number(value.trim().replace(',', '.').replace(/%$/, '')) : NaN;
  if (!Number.isFinite(result)) throw configError();
  return result;
}
function percentFactor(option: any): number {
  const raw = option.multiplier ?? option.value_percent ?? option.percent ?? option.value ?? 0;
  const n = numeric(raw);
  if (typeof raw === 'string' && raw.trim().endsWith('%')) return 1 + n / 100;
  return Math.abs(n) >= 2 ? 1 + n / 100 : n !== 0 ? n : 1;
}
function fixedDelta(option: any): number {
  // Match the widget's explicit units and legacy EUR/cents convention.
  for (const [field, scale] of [['value_cents',1],['amount_cents',1],['value_eur',100],['amount_eur',100]] as const) {
    if (option[field] !== undefined && Number.isFinite(Number(option[field]))) return Math.round(Number(option[field]) * scale);
  }
  const n = numeric(option.value ?? option.amount ?? 0);
  const unit = String(option.unit ?? '').toLowerCase();
  if (unit === 'cents' || unit === 'cent') return Math.round(n);
  if (unit === 'eur' || unit === '€') return Math.round(n * 100);
  return Math.abs(n) <= 200 ? Math.round(n * 100) : Math.round(n);
}
export function calculateLeadQuote(baseCents: number, rules: {questions: Record<string, any>; order?: string[]}, answers: any, voucher: boolean) {
  if (!money(baseCents)) throw configError();
  if (!object(answers) || typeof voucher !== 'boolean') throw invalid();
  const entries = Object.entries(rules.questions);
  if (!entries.length || entries.length > 100) throw configError();
  const known = new Set(entries.map(([key]) => key));
  if (Object.keys(answers).some(key => !known.has(key))) throw invalid();
  if (rules.order?.length) {
    const indexes = new Map(rules.order.map((key, i) => [key, i]));
    entries.sort((a,b) => (indexes.get(a[0]) ?? 999) - (indexes.get(b[0]) ?? 999));
  } else if (entries.some(([key]) => preferredOrder.includes(key))) {
    const rank = (key: string) => preferredOrder.indexOf(key) === -1 ? 999 : preferredOrder.indexOf(key);
    entries.sort((a,b) => rank(a[0]) - rank(b[0]));
  }
  let price = baseCents;
  const answerRows: Array<{ question: string; answer: string }> = [];
  for (const [key, block] of entries) {
    if (!object(block) || !Array.isArray(block.options) || !block.options.length) throw configError();
    const answer = answers[key];
    if (typeof answer !== 'string' || !answer || answer.length > 200) throw invalid();
    const matches = block.options.filter((option: any) => object(option) && option.active !== false && option.key === answer);
    if (matches.length !== 1) throw invalid();
    const option = matches[0];
    answerRows.push({
      question: typeof block.title === 'string' && block.title.trim() ? block.title : key,
      answer: typeof option.label === 'string' && option.label.trim() ? option.label : answer,
    });
    const kind = String(option.type ?? option.kind ?? 'fixed').toLowerCase();
    if (kind === 'percent' || kind === 'percentage') price = Math.round(price * percentFactor(option));
    else if (['fixed','amount','delta'].includes(kind)) price = Math.max(0, price + fixedDelta(option));
    else throw configError();
    if (!money(price)) throw configError();
  }
  price = Math.round(price / 500) * 500;
  const total = voucher ? Math.round(Math.round(price * 1.05) / 500) * 500 : price;
  if (!money(price) || !money(total)) throw configError();
  return { base_price_cents: baseCents, final_price_cents: price,
    final_price_with_voucher_cents: total, voucher_bonus_cents: total - price,
    questions_answers_html: renderAnswerSummary(answerRows) };
}

export async function verifyLeadPrice(db: any, input: any) {
  if (!object(input) || typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200 ||
      !Number.isSafeInteger(input.capacity_gb) || input.capacity_gb < 0 ||
      (input.variant != null && (typeof input.variant !== 'string' || input.variant.length > 200)) ||
      !money(input.base_price_cents) || !money(input.final_price_cents) ||
      (input.wants_voucher !== undefined && typeof input.wants_voucher !== 'boolean')) throw invalid();
  const { data: catalog, error } = await db.from('buyback_catalog')
    .select('model, category, variant, connectivity, submodel, capacity_gb, base_price_cents, active')
    .eq('model', input.model).eq('active', true);
  if (error) throw configError();
  if (!Array.isArray(catalog) || !catalog.length) throw invalid();
  const variant = (input.variant ?? '').trim();
  const candidates = catalog.filter((row: any) => row.active === true &&
    (row.variant ?? row.connectivity ?? row.submodel ?? '').toString().trim() === variant &&
    (Number(row.capacity_gb ?? 0) || 0) === input.capacity_gb);
  if (!candidates.length) throw invalid();
  const categories = new Set(catalog.map((row: any) => row.category).filter(Boolean));
  if (categories.size !== 1 || candidates.some((row: any) => !money(row.base_price_cents))) throw configError();
  const category = Array.from(categories)[0];
  // The widget deduplicates equal variant/capacity rows using the highest active price.
  const base = Math.max(...candidates.map((row: any) => row.base_price_cents));
  let categoryResult = await db.from('buyback_multipliers_per_category_json')
    .select('category, questions_json').eq('category', category).maybeSingle();
  if (categoryResult.error) throw configError();
  if (!categoryResult.data) {
    const fallback = await db.from('buyback_multipliers_per_category_json').select('category, questions_json')
      .ilike('category', category).limit(1);
    if (fallback.error) throw configError();
    categoryResult = { data: fallback.data?.[0] ?? null, error: null };
  }
  if (!categoryResult.data) throw configError();
  let rules = normalizeRules(categoryResult.data.questions_json);
  let assignmentResult = await db.from('buyback_model_multiplier_assignments')
    .select('assigned_set, uses_category').eq('model', input.model).eq('category', category).maybeSingle();
  if (assignmentResult.error) throw configError();
  if (!assignmentResult.data) {
    const fallback = await db.from('buyback_model_multiplier_assignments').select('assigned_set, uses_category')
      .eq('category', category).ilike('model', input.model).limit(1);
    if (fallback.error) throw configError();
    assignmentResult = { data: fallback.data?.[0] ?? null, error: null };
  }
  const assignment = assignmentResult.data;
  if (assignment?.uses_category === false && assignment.assigned_set) {
    const setResult = await db.from('buyback_multiplier_sets_json').select('questions, "order"')
      .eq('category', category).eq('name', assignment.assigned_set).maybeSingle();
    if (setResult.error || !setResult.data) throw configError();
    const parsed = parseObject(setResult.data.questions);
    rules = normalizeRules({ ...parsed, question_order: setResult.data.order ?? parsed.question_order });
  }
  const quote = calculateLeadQuote(base, rules, input.answers, input.wants_voucher ?? false);
  if (input.base_price_cents !== quote.base_price_cents || input.final_price_cents !== quote.final_price_cents) {
    throw new LeadPriceError('QUOTE_CHANGED', 409);
  }
  return quote;
}
