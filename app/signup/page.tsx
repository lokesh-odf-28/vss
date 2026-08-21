import Link from 'next/link';
import SignUpForm from '@/components/SignUpForm';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <h1 className="font-semibold text-lg">Video Intelligence</h1>
          <p className="text-[10px] tracking-widest text-neutral-500 mt-0.5">ON NVIDIA VSS</p>
        </div>
        <SignUpForm />
        <p className="text-xs text-neutral-500 mt-5 text-center">
          Already have an account? <Link href="/signin" className="text-blue-700 dark:text-blue-400 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
