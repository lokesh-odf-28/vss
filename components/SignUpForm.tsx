'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * One form creates both the organization and its one user — there is no
 * separate "organization profile" step (B1) in this model. See project notes
 * on "org = user".
 */
export default function SignUpForm() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Sign up failed');
      router.push('/use-cases');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
