export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Buyback Admin</h1>
        <nav className="space-x-3">
          <a href="/admin/catalog" className="underline">Catalogus</a>
          <a href="/admin/multipliers" className="underline">Multipliers</a>
          <a href="/admin/tips" className="underline">Tips</a>
        </nav>
      </header>
      {children}
    </div>
  );
}
