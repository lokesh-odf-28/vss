'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; icon: string; todo?: boolean };

export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-col gap-0.5">
      {items.map((n) => {
        const active = !n.todo && (pathname === n.href || pathname?.startsWith(`${n.href}/`));
        return (
          <Link
            key={n.href}
            href={n.todo ? '#' : n.href}
            className={`relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              n.todo
                ? 'text-neutral-400 dark:text-neutral-600 cursor-default'
                : active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-blue-600" />
            )}
            <span className="w-4 text-center text-xs">{n.icon}</span>
            {n.label}
            {n.todo && <span className="ml-auto text-[9px] uppercase tracking-wider">todo</span>}
          </Link>
        );
      })}
    </nav>
  );
}
