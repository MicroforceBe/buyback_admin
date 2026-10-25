export function resolveReceptionStatusFilter(
  requested: string | undefined,
  options: { value: string; label: string | null }[],
  items: { refurb_status: string | null }[],
): string {
  if (!requested?.trim()) return '__all__';
  const normalized = requested.trim().toLowerCase();
  const option = options.find(row => row.value.trim().toLowerCase() === normalized || row.label?.trim().toLowerCase() === normalized);
  if (option) return option.value;
  const item = items.find(row => row.refurb_status?.trim().toLowerCase() === normalized);
  return item?.refurb_status?.trim() || '__all__';
}
