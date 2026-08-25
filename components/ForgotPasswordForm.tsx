'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Two steps: request a code → enter it with a new password. A code you type
 * in rather than a clickable email link — deliberately, so corporate email
 * scanners that pre-fetch links cannot burn a single-use token before the
 * real recipient opens it. Same OTP machinery as signup verification.
 */
export default function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong');
      // Same message whether or not the account exists — see the route.
      setInfo(body.data.message);
      setStep('reset');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setInfo(null);
    await requestCode({ preventDefault() {} } as React.FormEvent);
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not reset password');
      router.push('/use-cases');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (step === 'reset') {
    return (
      <form onSubmit={resetPassword} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-600 dark:text-neutral-400">
            {info}
          </div>
        )}
        <div>
          <label htmlFor="code" className="block text-xs font-semibold mb-1">Verification code</label>
          <input
            id="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus
            maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm tracking-[0.3em] text-center font-mono"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-semibold mb-1">New password</label>
          <input
            id="password" type="password" autoComplete="new-password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-xs font-semibold mb-1">Confirm new password</label>
          <input
            id="confirm" type="password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit" disabled={busy || code.length !== 6}
          className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
        <button
          type="button" onClick={resend} disabled={busy}
          className="w-full text-center text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Resend code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Enter your account email and we&apos;ll send a code to reset your password.
      </p>
      <div>
        <label htmlFor="email" className="block text-xs font-semibold mb-1">Email</label>
        <input
          id="email" type="email" autoComplete="username" required autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit" disabled={busy}
        className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send reset code'}
      </button>
    </form>
  );
}
