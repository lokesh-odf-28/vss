import Link from 'next/link';

/** Entry point to C3, where source and mode are actually chosen. */
export default function RunButton({ useCaseId }: { useCaseId: string }) {
  return (
    <Link
      href={`/use-cases/${useCaseId}/run`}
      className="rounded-md bg-neutral-900 dark:bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-white dark:text-neutral-900"
    >
      Run ▸
    </Link>
  );
}
