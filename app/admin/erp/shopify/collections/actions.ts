'use server';
// Collection report actions: generating the report, applying and undoing fixes are admin-only.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/security/access';
import { applyCollectionFixes, generateCollectionReport, revertCollectionFix } from '@/lib/shopify/collectionsRun';
import { COLLECTION_FIX_KINDS, type CollectionFix } from '@/lib/shopify/collections';

const PATH = '/admin/erp/shopify/collections';
const back = (params: Record<string, string>) => `${PATH}?${new URLSearchParams(params)}`;

export async function generateCollectionReportAction() {
  const user = await requireAccess('erp', 'write', true);
  let target: string;
  try {
    const id = await generateCollectionReport(String(user.email ?? 'admin'));
    target = back({ report: id });
  } catch (error) {
    target = back({ error: error instanceof Error ? error.message.slice(0, 300) : 'Rapport mislukt.' });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function applyCollectionFixesAction(formData: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const reportId = String(formData.get('report') ?? '');
  const keep = { report: reportId, ...(formData.get('issue') ? { issue: String(formData.get('issue')) } : {}) };
  if (formData.get('confirm') !== 'on') redirect(back({ ...keep, error: 'Bevestig de aanpassing eerst.' }));
  const kinds = formData.getAll('kind').map(String).filter((k): k is CollectionFix['kind'] => (COLLECTION_FIX_KINDS as readonly string[]).includes(k));
  if (!kinds.length) redirect(back({ ...keep, error: 'Kies welke aanpassingen je wilt uitvoeren.' }));
  let target: string;
  try {
    const r = await applyCollectionFixes({ reportId, collectionIds: formData.getAll('ids').map(String), kinds, actor: String(user.email ?? 'admin') });
    target = back({ ...keep, applied: String(r.applied), skipped: String(r.skipped), failed: String(r.failed), nomatch: String(r.noMatch) });
  } catch (error) {
    target = back({ ...keep, error: error instanceof Error ? error.message.slice(0, 300) : 'Aanpassen mislukt.' });
  }
  revalidatePath(PATH);
  redirect(target);
}

export async function revertCollectionFixAction(formData: FormData) {
  const user = await requireAccess('erp', 'write', true);
  const reportId = String(formData.get('report') ?? '');
  const fixId = Number(formData.get('fix'));
  let target: string;
  if (!Number.isSafeInteger(fixId) || fixId <= 0) target = back({ report: reportId, error: 'Ongeldige aanpassing.' });
  else {
    try {
      const r = await revertCollectionFix({ fixId, actor: String(user.email ?? 'admin') });
      target = back({ report: reportId, ...(r.ok ? { notice: 'Aanpassing teruggedraaid.' } : { error: `Niet teruggedraaid: ${r.detail}.` }) });
    } catch (error) {
      target = back({ report: reportId, error: error instanceof Error ? error.message.slice(0, 300) : 'Terugdraaien mislukt.' });
    }
  }
  revalidatePath(PATH);
  redirect(target);
}
