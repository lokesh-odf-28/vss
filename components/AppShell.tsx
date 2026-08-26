import { currentUser } from '@/lib/auth';
import { vssMode } from '@/lib/vss';
import SignOutButton from './SignOutButton';
import NavLinks from './NavLinks';

const NAV = [
  { href: '/use-cases', label: 'Use Cases', icon: '🧭' },
  { href: '/runs',      label: 'Runs',      icon: '▶' },
  { href: '/search',    label: 'Search',    icon: '🔎', todo: true },
  { href: '/incidents', label: 'Incidents', icon: '📋', todo: true },
  { href: '/alerts',    label: 'Alerts',    icon: '⚠️' },
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
        <NavLinks items={NAV} />
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
