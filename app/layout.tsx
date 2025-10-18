import "@/app/globals.css";
export const metadata = { title: 'Buyback Admin', description: 'Admin UI' }; 
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
