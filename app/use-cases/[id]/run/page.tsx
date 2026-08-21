import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUseCase, listSources } from '@/lib/store';
import RunLauncher from '@/components/RunLauncher';

export const dynamic = 'force-dynamic';

/** C3 — Launch a run: use case + mode + source. */
export default async function RunLaunchPage({ params }: { params: { id: string } }) {
  const [useCase, sources] = await Promise.all([getUseCase(params.id), listSources()]);
  if (!useCase) notFound();

  return (
    <div className="p-6">
      <Link href="/use-cases" className="text-xs text-neutral-500 underline">← Use Cases</Link>
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
