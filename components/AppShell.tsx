import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { vssMode } from '@/lib/vss';
import SignOutButton from './SignOutButton';

const NAV = [
  { href: '/use-cases', label: 'Use Cases', icon: '🧭' },
  { href: '/runs',      label: 'Runs',      icon: '▶' },
  { href: '/search',    label: 'Search',    icon: '🔎', todo: true },
  { href: '/incidents', label: 'Incidents', icon: '📋', todo: true },
  { href: '/alerts',    label: 'Alerts',    icon: '⚠️', todo: true },
  { href: '/sources',   label: 'Sources',   icon: '🎥', todo: true },
];

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  // Signed out (e.g. the sign-in page) renders bare — no sidebar to wrap.
  if (!user) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-neutral-200 dark:border-neutral-800 p-3 flex flex-col">
        <div className="px-2 py-1">
          <div className="font-semibold">Video Intelligence</div>
          <div className="text-[10px] tracking-widest text-neutral-500 mt-0.5">ON NVIDIA VSS</div>
        </div>
        <nav className="mt-6 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.todo ? '#' : n.href}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                n.todo
                  ? 'text-neutral-400 dark:text-neutral-600 cursor-default'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              <span className="w-4 text-center text-xs">{n.icon}</span>
              {n.label}
              {n.todo && <span className="ml-auto text-[9px] uppercase tracking-wider">todo</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
          <div className="px-2">
            <div className="text-xs font-medium truncate">{user.name}</div>
            <div className="text-[10px] text-neutral-500 truncate">{user.email}</div>
          </div>
          <SignOutButton />
          <VssBadge />
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

async function VssBadge() {
  const label = vssMode === 'mock' ? 'mock' : vssMode === 'nvidia-hosted' ? 'nvidia-hosted' : 'live';
  const detail =
    vssMode === 'mock' ? 'no GPU needed'
    : vssMode === 'nvidia-hosted' ? 'real model, no VSS deployment'
    : process.env.LVS_URL;
  return (
    <div className="px-2 text-[10px] font-mono text-neutral-500">
      VSS: <span className={vssMode === 'mock' ? 'text-amber-600' : 'text-emerald-600'}>{label}</span>
      <div className="mt-0.5">{detail}</div>
    </div>
  );
}
