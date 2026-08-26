import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUseCase, listSources } from '@/lib/store';
import { currentUser } from '@/lib/auth';
import RunLauncher from '@/components/RunLauncher';

export const dynamic = 'force-dynamic';

/** C3 — Launch a run: use case + mode + source. */
export default async function RunLaunchPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect('/signin');
  const [useCase, sources] = await Promise.all([
    getUseCase(params.id, user.orgId),
    listSources(user.orgId),
  ]);
  if (!useCase) notFound();

  return (
    <div className="p-6 animate-fade-in">
      <Link href="/use-cases" className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200">← Use Cases</Link>
      <header className="mt-3 mb-5 flex items-center gap-2.5">
        <span className="text-2xl">{useCase.icon}</span>
        <div>
          <h1 className="text-lg font-semibold">Run {useCase.name}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{useCase.description}</p>
        </div>
      </header>
      <RunLauncher useCase={useCase} sources={sources} />
    </div>
  );
}
