import { BadgeCheck, Database, FlaskConical, PlayCircle } from 'lucide-react';
import type { EvidenceClaimData, EvidenceStatus } from '@/lib/landing-content';

const statusLabels: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  proposed: 'Proposed',
  synthetic: 'Synthetic',
  simulated: 'Simulated',
};

const statusStyles: Record<EvidenceStatus, string> = {
  verified: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100',
  proposed: 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
  synthetic: 'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100',
  simulated: 'bg-purple-100 text-purple-950 dark:bg-purple-950 dark:text-purple-100',
};

const statusIcons = {
  verified: BadgeCheck,
  proposed: FlaskConical,
  synthetic: Database,
  simulated: PlayCircle,
};

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const Icon = statusIcons[status];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {statusLabels[status]}
    </span>
  );
}

export function EvidenceClaim({ claim }: { claim: EvidenceClaimData }) {
  if (claim.status === 'verified' && (!claim.sources || claim.sources.length === 0)) {
    throw new Error(`Verified claim "${claim.id}" must include at least one source.`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceBadge status={claim.status} />
        <p className="m-0 min-w-0 flex-1 text-sm leading-6 text-foreground dark:text-slate-100">
          {claim.text}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-xs text-muted-foreground dark:text-slate-300">
        {claim.sources?.length ? (
          claim.sources.map((source) => (
            <a
              key={`${claim.id}-${source.href}`}
              className="min-h-11 break-all py-3 underline decoration-current underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-emerald-300"
              href={source.href}
            >
              Source: {source.label}
            </a>
          ))
        ) : (
          <span className="py-1">No linked evidence yet.</span>
        )}
      </div>
    </div>
  );
}
