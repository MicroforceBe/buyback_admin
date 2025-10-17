import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r">
        <div className="h-16 flex items-center px-5 border-b">
          <span className="text-base font-semibold">Buyback Admin</span>
        </div>
        <nav className="p-3 space-y-1">
          <NavItem href="/admin/catalog" label="Catalogus" />
          <NavItem href="/admin/multipliers" label="Multipliers" />
          <NavItem href="/admin/tips" label="UI Tips" />
        </nav>
      </aside>

      <div className="ml-64">
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <div className="text-sm text-gray-500">
            <span className="font-medium text-gray-900">Admin</span> · beheer
          </div>
          <div className="text-xs text-gray-500">v1</div>
        </header>

        <main className="p-6">
          <div className="max-w-[1200px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  const base =
    'block px-3 py-2 rounded-md text-sm hover:bg-gray-100 hover:text-gray-900';
  const active =
    typeof window !== 'undefined' && window.location.pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`${base} ${active ? 'bg-gray-100 font-medium' : 'text-gray-700'}`}
    >
      {label}
    </Link>
  );
}
