'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Two steps: submit details → enter the emailed code. No app_user row exists
 * until step 2 succeeds — step 1 only issues an OTP challenge server-side.
 * See app/api/auth/signup/{start,verify}.
 */
export default function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'code'>('details');

  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Sign up failed');
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not resend');
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not verify code');
      router.push('/use-cases');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (step === 'code') {
    return (
      <form onSubmit={submitCode} className="space-y-3">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          We sent a 6-digit code to <span className="font-medium text-neutral-900 dark:text-neutral-100">{email}</span>.
        </p>
        <div>
          <label htmlFor="code" className="block text-xs font-semibold mb-1">Verification code</label>
          <input
            id="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus
            maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm tracking-[0.3em] text-center font-mono"
          />
        </div>
        <button
          type="submit" disabled={busy || code.length !== 6}
          className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Verify and create account'}
        </button>
        <button
          type="button" onClick={resend} disabled={busy}
          className="w-full text-center text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          {resent ? 'Sent — check your email' : 'Resend code'}
        </button>
        <button
          type="button" onClick={() => setStep('details')}
          className="w-full text-center text-xs text-neutral-400"
        >
          ← Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="orgName" className="block text-xs font-semibold mb-1">Organization name</label>
        <input
          id="orgName" required autoFocus
          value={orgName} onChange={(e) => setOrgName(e.target.value)}
          placeholder="Acme Logistics"
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-xs font-semibold mb-1">Your name</label>
        <input
          id="name" required
          value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-xs font-semibold mb-1">Email</label>
        <input
          id="email" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-semibold mb-1">Password</label>
        <input
          id="password" type="password" autoComplete="new-password" required minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-neutral-400 mt-1">At least 8 characters</p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-xs font-semibold mb-1">Confirm password</label>
        <input
          id="confirm" type="password" autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit" disabled={busy}
        className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Sending code…' : 'Continue'}
      </button>
    </form>
  );
}
