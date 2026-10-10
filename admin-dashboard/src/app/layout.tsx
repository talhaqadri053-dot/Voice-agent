import type { Metadata } from 'next';
import './globals.css';
import './admin.css';
import './live-operations.css';
import './call-detail.css';
import './menu-manager.css';
import './promotions.css';

export const metadata: Metadata = {
  title: 'Restaurant Admin',
  description: 'Manage orders, reservations, and calls.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}