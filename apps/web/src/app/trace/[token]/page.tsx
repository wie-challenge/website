'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TraceQr } from '@/components/trace-qr';
import { EvidenceNotice } from '@/components/evidence-notice';

type PublicTrace = {
  status: 'PUBLISHED' | 'REVOKED';
  provenance: 'SYNTHETIC';
  publishedAt: string | null;
  version: number;
  content: {
    productTitle?: string;
    craftName?: string;
    story?: string;
    coarseRegion?: string;
    share?: {
      availability?: string;
      percent?: string | null;
      basis?: string;
      numerator?: string;
      denominator?: string;
      paid?: boolean;
      tax?: string;
      label?: string;
    };
  } | null;
};
function publishedOn(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export default function Page() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'missing' | 'revoked' | 'ready' | 'error'>(
    'loading',
  );
  const [record, setRecord] = useState<PublicTrace | null>(null);
  const [href, setHref] = useState('');
  useEffect(() => {
    let active = true;
    setHref(window.location.href);
    fetch(`/api/v1/public/traceability/${params.token}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setState('missing');
          return;
        }
        const body = (await response.json()) as PublicTrace;
        setRecord(body);
        setState(body.status === 'REVOKED' ? 'revoked' : 'ready');
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [params.token]);
  return (
    <main id="main-content" className="workspace">
      <article className="trace-sheet">
        <h1>Product traceability</h1>
        {state === 'loading' && <p role="status">Loading public record…</p>}
        {state === 'error' && (
          <p role="alert">This traceability link could not be loaded. Try again.</p>
        )}
        {state === 'missing' && <p>This traceability link is not available.</p>}
        {state === 'revoked' && (
          <p>This public record was revoked. The previous content is no longer available.</p>
        )}
        {state === 'ready' && record?.content && (
          <>
            <p>
              Provenance: synthetic demonstration. This page does not show personal contacts,
              individual pay, or monitoring data.
            </p>
            <EvidenceNotice
              claimId="trace.public-story"
              claimType="Public craft record"
              status="SYNTHETIC"
              sourceReference="/evidence#scenario"
              limitations={[
                'Reviewed synthetic craft content is not a physical provenance certificate, independent testimonial or verified delivery record.',
              ]}
            />
            <h2>{record.content.productTitle}</h2>
            <p>
              Craft: {record.content.craftName}. Region: {record.content.coarseRegion}.
            </p>
            <p>{record.content.story}</p>
            <p>
              The approved story is the reviewed production summary. This page does not add a
              process, certificate, or testimonial.
            </p>
            {record.publishedAt && (
              <p>
                Published {publishedOn(record.publishedAt)} (Africa/Tunis). Version {record.version}
                .
              </p>
            )}
            {href && <TraceQr value={href} />}
            <h2>Producer share</h2>
            <EvidenceNotice
              compact
              claimId="trace.producer-share"
              claimType="Agreed producer-share metric"
              status="SYNTHETIC"
              sourceReference="/evidence#producer-share"
              limitations={[
                'Agreed compensation divided by accepted quotation is not verified paid income, realized profit or a fairness guarantee.',
              ]}
            />
            <p>
              The metric is agreed direct artisan compensation divided by the accepted quotation for
              this order. It is not earned pay, not verified paid income, and not a fairness
              guarantee. Tax is excluded pending legal review.
            </p>
            {record.content.share?.availability === 'AVAILABLE' ? (
              <p>
                {record.content.share.percent} of the agreed quotation basis.{' '}
                {record.content.share.numerator} divided by {record.content.share.denominator}.{' '}
                {record.content.share.label} Paid compensation: no. {record.content.share.tax}
              </p>
            ) : (
              <p>
                The percentage is withheld. A single identifiable worker's compensation is not
                published, and a missing denominator is not replaced with a guess.
              </p>
            )}
          </>
        )}
      </article>
    </main>
  );
}
