'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AudioLines,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Gift,
  Headset,
  Phone,
  Settings2,
  Utensils,
} from 'lucide-react';
import { SignOutButton } from '@/components/sign-out-button';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: ChartNoAxesCombined, exact: true },
  { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList },
  { href: '/dashboard/bookings', label: 'Reservations', icon: CalendarDays },
  { href: '/dashboard/calls', label: 'Calls', icon: Headset },
  { href: '/dashboard/test-call', label: 'Test call', icon: Phone },
  { href: '/dashboard/menu', label: 'Menu', icon: Utensils },
  { href: '/dashboard/promotions', label: 'Promotions', icon: Gift },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings2 },
];

export function AdminShell({ children, email, businessName, weekday, assistantActive }: { children: React.ReactNode; email: string; businessName: string; weekday: string; assistantActive: boolean }) {
  const pathname = usePathname();
  const currentPage = navigation.find((item) => item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <span className="brand-symbol"><AudioLines size={21} strokeWidth={2.2} /></span>
          <span className="brand-wordmark">{businessName}</span>
        </Link>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon, exact }, index) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link className={`nav-link${active ? ' active' : ''}`} href={href} key={href}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                {index === 1 && <span className="nav-count">•</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="assistant-status"><span className={assistantActive ? 'live-dot' : 'live-dot inactive'} style={assistantActive ? undefined : { backgroundColor: '#d2aa83', boxShadow: '0 0 0 3px #d2aa8322' }} /><span><b>Voice assistant</b><small>{assistantActive ? 'Active · Vapi' : 'No recent calls · Vapi'}</small></span><span className="status-wave"><AudioLines size={17} /></span></div>
          <div className="sidebar-user"><span className="avatar">{email.slice(0, 1).toUpperCase()}</span><span className="user-copy"><b>Administrator</b><small>{email}</small></span></div>
          <SignOutButton />
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-symbol"><AudioLines size={18} /></span> {businessName}</div>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><b>{currentPage?.label ?? 'Admin'}</b></div>
          <div className="topbar-meta"><span className="today-label">{weekday.toUpperCase()} · OPERATIONS</span><span className="topbar-avatar">{email.slice(0, 1).toUpperCase()}</span></div>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return <Link href={href} aria-label={label} title={label} className={active ? 'active' : ''} key={href}><Icon size={19} /></Link>;
          })}
          <SignOutButton />
        </nav>
        <main className="main-content page-enter">{children}</main>
      </div>
    </div>
  );
}