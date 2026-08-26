import { redirect } from 'next/navigation';
import { listAlertRules, listUseCases, listSources } from '@/lib/store';
import { currentUser } from '@/lib/auth';
import AlertRuleForm from '@/components/AlertRuleForm';
import AlertRuleRow from '@/components/AlertRuleRow';

export const dynamic = 'force-dynamic';

/** Which events page someone, and on which camera. Design doc D3. */
export default async function AlertsPage() {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const [rules, useCases, sources] = await Promise.all([
    listAlertRules(user.orgId),
    listUseCases(user.orgId),
    listSources(user.orgId),
  ]);

  return (
    <div className="p-6 animate-fade-in">
      <header className="mb-5">
        <h1 className="text-lg font-semibold">Alerts</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Which events page someone, and on which camera.
        </p>
      </header>

      <AlertRuleForm useCases={useCases} sources={sources} />

      {rules.length === 0 ? (
        <p className="text-sm text-neutral-500 mt-6">No alert rules yet.</p>
      ) : (
        <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
          {rules.map((r) => <AlertRuleRow key={r.id} rule={r} />)}
        </div>
      )}
    </div>
  );
}
