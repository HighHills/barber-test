import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Barbershop Operating System',
  description: 'Production-Grade Barbershop Management Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="id">
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
