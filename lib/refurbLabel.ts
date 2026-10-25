type StatusOption = { value: string; label: string };
function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}
export function canPrintRefurbLabel(status: string | null | undefined, options: StatusOption[] = []) {
  const value = normalize(status);
  if (!value) return false;
  const option = options.find(option => normalize(option.value) === value || normalize(option.label) === value);
  const allowed = (text: string) => text === 'finished' || text === 'ready to book';
  return allowed(value) || !!option && (allowed(normalize(option.value)) || allowed(normalize(option.label)));
}

