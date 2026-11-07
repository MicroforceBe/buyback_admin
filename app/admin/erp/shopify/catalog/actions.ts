'use server';
// Catalogue report actions: generating the report and applying fixes are admin-only.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { applyCatalogFixes, generateCatalogReport, revertCatalogFix } from '@/lib/shopify/catalogRun';
import { FIX_KINDS, type Fix } from '@/lib/shopify/catalog';

const PATH = '/admin/erp/shopify/catalog';
const back = (params: Record<string, string>) => `${PATH}?${new URLSearchParams(params)}`;

export async function generateReportAction() {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const id = await generateCatalogReport(String(user.email ?? 'admin'));
    target = back({ report: id });
  } catch (error) {
    target = back({ error: error instanceof Error ? error.message.slice(0, 300) : 'Rapport mislukt.' });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function applyFixesAction(formData: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const reportId = String(formData.get('report') ?? '');
  const keep = { report: reportId, ...(formData.get('issue') ? { issue: String(formData.get('issue')) } : {}) };
  if (formData.get('confirm') !== 'on') redirect(back({ ...keep, error: 'Bevestig de aanpassing eerst.' }));
  const kinds = formData.getAll('kind').map(String).filter((k): k is Fix['kind'] => (FIX_KINDS as readonly string[]).includes(k));
  if (!kinds.length) redirect(back({ ...keep, error: 'Kies welke aanpassingen je wilt uitvoeren.' }));
  let target: string;
  try {
    const r = await applyCatalogFixes({ reportId, productIds: formData.getAll('ids').map(String), kinds, actor: String(user.email ?? 'admin') });
    target = back({ ...keep, applied: String(r.applied), skipped: String(r.skipped), failed: String(r.failed), nomatch: String(r.noMatch) });
  } catch (error) {
    target = back({ ...keep, error: error instanceof Error ? error.message.slice(0, 300) : 'Aanpassen mislukt.' });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function revertFixAction(formData: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const reportId = String(formData.get('report') ?? '');
  const fixId = Number(formData.get('fix'));
  let target: string;
  if (!Number.isSafeInteger(fixId) || fixId <= 0) target = back({ report: reportId, error: 'Ongeldige aanpassing.' });
  else {
    try {
      const r = await revertCatalogFix({ fixId, actor: String(user.email ?? 'admin') });
      target = back({ report: reportId, ...(r.ok ? { notice: 'Aanpassing teruggedraaid.' } : { error: `Niet teruggedraaid: ${r.detail}.` }) });
    } catch (error) {
      target = back({ report: reportId, error: error instanceof Error ? error.message.slice(0, 300) : 'Terugdraaien mislukt.' });
    }
  }
  revalidatePath(PATH);
  redirect(target);
}
