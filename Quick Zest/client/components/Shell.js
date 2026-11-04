'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingBag, ArrowDownLeft, ArrowUpRight, TrendingUp, Settings, LogOut, Menu, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from './ui';
import ChatWidget from './ChatWidget';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/income', label: 'Money In', icon: ArrowDownLeft, hint: 'Payments received' },
  { href: '/expenses', label: 'Money Out', icon: ArrowUpRight, hint: 'Spending' },
  { href: '/profit', label: 'Profit & Reports', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

export function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-sm">
        Q
      </div>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight text-stone-900">Quick Zest</p>
        <p className="text-[11px] text-stone-500">Operations</p>
      </div>
    </div>
  );
}

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState(null);
  const [open, setOpen] = useState(false);
  const [waking, setWaking] = useState(false);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    const onWake = () => setWaking(true);
    window.addEventListener('qx-waking', onWake);
    api('/auth/me')
      .then((d) => setAdmin(d.admin))
      .catch((e) => (e.status === 401 ? router.replace('/login') : setFailed(e.message)));
    return () => window.removeEventListener('qx-waking', onWake);
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };

  if (!admin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        {failed ? (
          <>
            <p className="font-medium text-stone-800">Couldn't reach the server</p>
            <p className="max-w-sm text-sm text-stone-500">{failed}</p>
            <button className="btn-secondary" onClick={() => window.location.reload()}>Try again</button>
          </>
        ) : (
          <>
            <Spinner />
            {waking && <p className="max-w-xs text-sm text-stone-500">Waking up the server — this takes up to a minute after it has been idle…</p>}
          </>
        )}
      </div>
    );
  }

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <Icon size={18} className={isActive(href) ? 'text-brand-600' : 'text-stone-400'} />
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-stone-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
          {(admin.name || 'A').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800">{admin.name}</p>
          <p className="truncate text-xs text-stone-500">{admin.email}</p>
        </div>
        <button onClick={logout} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <AdminCtx.Provider value={admin}>
      <div className="min-h-screen lg:pl-64">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone-200 bg-white lg:flex">
          <Logo className="px-5 py-5" />
          {nav}
          {footer}
        </aside>

        {/* Mobile top bar + drawer */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" aria-label="Open menu">
            <Menu size={20} />
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-stone-900/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between px-5 py-4">
                <Logo />
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close menu">
                  <X size={18} />
                </button>
              </div>
              {nav}
              {footer}
            </aside>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 pb-24 lg:pb-24">{children}</main>
        <ChatWidget />
      </div>
    </AdminCtx.Provider>
  );
}
