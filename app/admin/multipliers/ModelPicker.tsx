'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function ModelPicker({
  models,
  selected,
}: { models: string[]; selected: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value) next.set('model', e.target.value);
    else next.delete('model');
    router.push(`/admin/multipliers?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Model:</span>
      <select
        className="border px-2 py-1 rounded"
        value={selected}
        onChange={onChange}
      >
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
