import { notFound } from 'next/navigation';
import { getUseCase } from '@/lib/store';
import { currentUser } from '@/lib/auth';
import UseCaseForm from '@/components/UseCaseForm';

export const dynamic = 'force-dynamic';

export default async function EditUseCasePage({ params }: { params: { id: string } }) {
  const user = (await currentUser())!;
  const uc = await getUseCase(params.id, user.orgId);
  if (!uc) notFound();

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold">Edit use case</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{uc.name}</p>
      </header>
      <UseCaseForm existing={uc} />
    </div>
  );
}
