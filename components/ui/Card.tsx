export function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border rounded-lg shadow-sm">{children}</div>; } export function CardHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      {actions}
    </div>
  );
}
export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>; }
