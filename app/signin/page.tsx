import Link from 'next/link';
import SignInForm from '@/components/SignInForm';

export const dynamic = 'force-dynamic';

export default function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-7">
          <h1 className="font-semibold text-lg">Video Intelligence</h1>
          <p className="text-[10px] tracking-widest text-neutral-500 mt-0.5">ON NVIDIA VSS</p>
        </div>
        <SignInForm next={searchParams.next} />
        <p className="text-xs text-neutral-500 mt-5 text-center">
          No account? <Link href="/signup" className="text-blue-700 dark:text-blue-400 font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
