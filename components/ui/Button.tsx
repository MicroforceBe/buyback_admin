export default function Button(
  { children, type = 'button', variant = 'primary', ...rest }:
  { children: React.ReactNode; type?: 'button'|'submit'; variant?: 'primary'|'secondary' } & React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  const base = 'px-3 py-1.5 rounded-md text-sm';
  const styles = variant === 'secondary'
    ? 'bg-white border text-gray-700 hover:bg-gray-50'
    : 'bg-black text-white hover:opacity-90';
  return (
    <button type={type} className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}
