import Link from 'next/link';
import {
  proposedEvidence,
  syntheticEvidence,
  type EvidenceMetadata,
  type publicEvidenceReferences,
} from '@nasj/contracts';

type Props = {
  claimId: string;
  claimType: string;
  status: 'PROPOSED' | 'SYNTHETIC';
  sourceReference?: (typeof publicEvidenceReferences)[number];
  scenarioId?: string;
  limitations?: string[];
  compact?: boolean;
};
export function EvidenceNotice({
  claimId,
  claimType,
  status,
  sourceReference,
  scenarioId,
  limitations,
  compact = false,
}: Props) {
  const metadata: EvidenceMetadata =
    status === 'PROPOSED'
      ? proposedEvidence(claimId, claimType, sourceReference, limitations)
      : syntheticEvidence(claimId, claimType, sourceReference, limitations, { scenarioId });
  return (
    <aside
      className={`evidence-notice${compact ? ' evidence-compact' : ''}`}
      aria-label={`Evidence for ${claimType}`}
      data-evidence-status={metadata.evidenceStatus}
      data-claim-id={metadata.claimId}
    >
      <span className="badge">{metadata.displayLabel}</span>
      {scenarioId && <span>Scenario {scenarioId}</span>}
      <p>{metadata.limitations.join(' ')}</p>
      <Link href={metadata.sourceReference}>Source and limitations</Link>
    </aside>
  );
}
