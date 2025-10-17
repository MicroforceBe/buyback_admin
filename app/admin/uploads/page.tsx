'use client';
import { useState, useTransition } from 'react';
import { importCsv } from './actions';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';

export const metadata = { title: 'Uploads — Buyback Admin' };

export default function UploadsPage() {
  const [busy, startTransition] = useTransition();
  const [log, setLog] = useState<string>('');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>, type: 'prices'|'multipliers') {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      startTransition(async () => {
        try {
          setLog(`Bezig met importeren van ${file.name}...`);
          const result = await importCsv({ type, csv: reader.result as string });
          setLog(`✅ ${file.name}: ${result.count} rijen geïmporteerd.`);
        } catch (err: any) {
          setLog(`❌ Fout: ${err.message}`);
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <main className="p-6 space-y-6">
      <Card>
        <CardHeader title="Importeer CSV’s" />
        <CardBody>
          <p className="text-sm text-gray-600 mb-3">
            Upload hier de meest recente buyback CSV’s. Het systeem wist eerst de landing tables en voert daarna automatisch
            de SQL-functies <code>import_buyback_prices()</code> of <code>import_buyback_multipliers()</code> uit.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Buyback prijzen CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => handleFile(e, 'prices')}
                disabled={busy}
                className="block w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Multipliers CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => handleFile(e, 'multipliers')}
                disabled={busy}
                className="block w-full border rounded p-2"
              />
            </div>
          </div>

          <div className="mt-6 text-sm whitespace-pre-wrap">{log}</div>
        </CardBody>
      </Card>
    </main>
  );
}
