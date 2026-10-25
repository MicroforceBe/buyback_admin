"use client";

import { useState } from 'react';
import { updateLeadInlineAction } from './actions';
import { getLeadStatusIssues, leadFieldLabels, type LeadDeviceFields } from '@/lib/leadDeviceValidation';

type Props = {
  id: string;
  currentStatus: string;
  currentLabel: string;
  options: Array<{ value: string; label: string; disabled: boolean }>;
  savedFields: LeadDeviceFields;
  canSave: boolean;
  cancelReason: string | null;
  overdueTitle?: string;
};

export default function LeadStatusForm(p: Props) {
  const [status, setStatus] = useState(p.currentStatus);
  const [reason, setReason] = useState(p.cancelReason ?? '');
  const issues = getLeadStatusIssues(status, p.savedFields);
  const messageId = `lead-status-message-${p.id}`;
  function showDeviceFields(nextStatus: string) {
    window.dispatchEvent(new CustomEvent('lead-device-validation', {
      detail: { id: p.id, fields: getLeadStatusIssues(nextStatus, p.savedFields) },
    }));
  }
  return (
    <form action={updateLeadInlineAction} className="space-y-2" data-lead-id={p.id}
      onSubmit={event => {
        if (issues.length || (status === 'cancelled' && !reason.trim()) || !p.canSave) {
          event.preventDefault();
          showDeviceFields(status);
        }
      }}>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="change_type" value="status" />
      <input type="hidden" name="previous_status" value={p.currentStatus} />
      <div className="inline-flex items-center gap-2">
        <select name="status" value={status} className="bb-select-sm inline-block pr-8"
          aria-label="Status wijzigen" aria-describedby={issues.length ? messageId : undefined}
          onChange={event => { setStatus(event.target.value); showDeviceFields(event.target.value); }}>
          <option value={p.currentStatus}>{p.currentLabel}</option>
          {p.options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </select>
        {p.overdueTitle && <button type="button" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold cursor-help" title={p.overdueTitle} aria-label={p.overdueTitle}>!</button>}
        <button className="bb-btn subtle h-8 text-xs px-2" type="submit" aria-label="Status opslaan"
          disabled={!p.canSave || issues.length > 0 || (status === 'cancelled' && !reason.trim())}
          title={issues.length ? 'Vul de ontbrekende gegevens aan en sla die eerst op' : 'Status opslaan'}>💾</button>
      </div>
      {issues.length > 0 && <div id={messageId} role="alert" className="max-w-sm rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
        <p className="font-semibold">Status kan nog niet opgeslagen worden.</p>
        <p className="mt-1">Ontbrekende of ongeldige gegevens:</p>
        <ul className="mt-1 list-disc pl-4">{issues.map(key => <li key={key}>{leadFieldLabels[key]}</li>)}</ul>
        <p className="mt-2">Vul deze gegevens aan en sla ze eerst op met het opslaanknopje bij het toestel. Kies daarna opnieuw de controlestatus.</p>
        <button type="button" className="mt-2 underline" onClick={() => showDeviceFields(status)}>Open toestelgegevens</button>
      </div>}
      {status === 'cancelled' && <label className="flex flex-col gap-1 text-xs text-gray-600">
        Reden annulatie
        <select name="cancel_reason" value={reason} required className="bb-select-sm inline-block pr-6" onChange={event => setReason(event.target.value)}>
          <option value="">-- Kies reden --</option>
          {['Fake order', 'Technische problemen met toestel', 'Klant heeft zich bedacht', 'Klant niet akkoord met nieuwe prijs', 'Klant vindt dat het te lang duurt', 'Test Order'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>}
    </form>
  );
}
