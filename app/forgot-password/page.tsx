import Link from 'next/link';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-7">
          <h1 className="font-semibold text-lg">Reset your password</h1>
        </div>
        <ForgotPasswordForm />
        <p className="text-xs text-neutral-500 mt-5 text-center">
          <Link href="/signin" className="text-blue-700 dark:text-blue-400 font-medium hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
