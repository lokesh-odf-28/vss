import UseCaseForm from '@/components/UseCaseForm';

export default function NewUseCasePage() {
  return (
    <div className="p-6 animate-fade-in">
      <header className="mb-5">
        <h1 className="text-lg font-semibold">New use case</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Describe what matters in your operation. This drives both recorded and live analysis.
        </p>
      </header>
      <UseCaseForm />
    </div>
  );
}
