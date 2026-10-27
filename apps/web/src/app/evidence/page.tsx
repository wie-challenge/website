import Link from 'next/link';
import { EvidenceNotice } from '@/components/evidence-notice';
import { SiteFooter, Wordmark } from '@/components/brand';

export const metadata = { title: 'Evidence, methodology and limitations' };
const sources = [
  {
    id: 'concept',
    title: 'Concept and research hypotheses',
    text: 'The starting proposal is managed B2B artisan production with a Tunisian embroidery focus. Buyer demand, artisan needs, pricing feasibility, income benefits and partner participation require research and approval. No interviews, partnerships or field outcomes are asserted here.',
    status: 'PROPOSED' as const,
  },
  {
    id: 'software',
    title: 'Implemented application workflows',
    text: 'The repository implements organization-scoped authentication, capacity declarations, procurement and costing, direct artisan offers, production and quality tracking, logistics, inventory controls and financial governance. They are exercised with synthetic records. A passing software check is evidence about that check, not evidence of physical supply, legal approval or income outcomes.',
    status: 'SYNTHETIC' as const,
  },
  {
    id: 'scenario',
    title: 'Synthetic scenario source',
    text: 'The showroom uses a versioned scenario and fictional participants. Review the active scenario identifier, stage, permissions and reset history in the demo. The initial quotation and supporting assumptions are seeded; buyer and artisan acceptance use real application actions on fictional accounts. No scenario state is a real buyer contract or actual artisan consent outside the demo.',
    status: 'SYNTHETIC' as const,
  },
  {
    id: 'methodology',
    title: 'How claims are classified',
    text: 'PROPOSED means a hypothesis or planned outcome. SYNTHETIC means generated, seeded or simulated demonstration information. MEASURED requires actual source measurements and an approved measurement policy. VERIFIED additionally requires approved source evidence, verification policy and an authorized independent reviewer. No measurement or verification publication authority is configured in this release. Manually choosing a label, adding a reviewer name or recording a screenshot cannot provide that authority.',
    status: 'PROPOSED' as const,
  },
  {
    id: 'producer-share',
    title: 'Producer-share calculation',
    text: 'The metric divides agreed direct artisan compensation by the accepted quotation amount for the same order. It describes agreed terms, not verified paid income, realized margin or a fairness guarantee. It is withheld for a small identifiable group or missing denominator. Tax treatment is pending legal review. No field income uplift is claimed.',
    status: 'SYNTHETIC' as const,
  },
  {
    id: 'payments',
    title: 'Financial evidence boundary',
    text: 'Simulated settlements do not transfer money. Buyer deposit claims and manual execution reports remain pending independent evidence. Recognized payables remain obligations; approval and a reported payment do not mark them paid. Verified paid remains zero without an approved external evidence source. Live payments, tax and invoice treatment require separate approvals.',
    status: 'SYNTHETIC' as const,
  },
  {
    id: 'physical-evidence',
    title: 'Inventory and custody boundary',
    text: 'Bills of materials describe requirements. Synthetic lots, manual handovers and recipient reports do not establish independently verified physical stock. Damaged and returned quantities remain segregated, and pending or discrepant receipts block readiness. No supplier purchasing or warehouse verification integration is asserted.',
    status: 'SYNTHETIC' as const,
  },
  {
    id: 'safety',
    title: 'Optional local safety research',
    text: 'Wearable safety is a separate proposed research track. Local monitoring and safety simulations stay outside commerce records, work eligibility, compensation and public QR data. No clinical effectiveness, injury reduction, hardware certification or deployed-device outcome is claimed.',
    status: 'PROPOSED' as const,
  },
  {
    id: 'privacy',
    title: 'Privacy-safe evidence references',
    text: 'Public references identify methodology and the synthetic source class, not raw artisan identities, contact details, individual pay or wearable signals. The public QR projection is restricted to reviewed craft content and privacy-aware aggregate information. Internal implementation files and private scenario records are not published as raw evidence here.',
    status: 'PROPOSED' as const,
  },
  {
    id: 'limitations',
    title: 'What remains unvalidated',
    text: 'Owner acceptance, field research, approved partner relationships, actual stock verification, approved accountless commercial acceptance, verified bank receipts and payouts, compensation policies, tax and invoicing policy, persistent deployment and live pilot authorization remain separate gates. Competition report and video preparation do not establish final submission or eligibility. A reliable synthetic presentation does not demonstrate pilot readiness.',
    status: 'PROPOSED' as const,
  },
];
export default function EvidencePage() {
  return (
    <>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Evidence navigation">
          <Link href="/">Concept</Link>
          <Link href="/demo">Demo</Link>
          <Link href="/presentation">Presentation</Link>
        </nav>
      </header>
      <main id="main-content" className="public-reading">
        <p className="kicker">NASJ · public evidence register</p>
        <h1>What the demonstration can establish.</h1>
        <p>
          This page records the source classes and limits behind public claims. It is a methodology
          register, not a verified field-results dashboard.
        </p>
        <nav aria-label="Evidence sources">
          <ul>
            {sources.map((source) => (
              <li key={source.id}>
                <a href={`#${source.id}`}>{source.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        {sources.map((source) => (
          <section id={source.id} key={source.id}>
            <h2>{source.title}</h2>
            <p>{source.text}</p>
            <EvidenceNotice
              compact
              claimId={`methodology.${source.id}`}
              claimType={source.title}
              status={source.status}
              sourceReference={
                `/evidence#${source.id}` as Parameters<typeof EvidenceNotice>[0]['sourceReference']
              }
              limitations={[
                source.status === 'SYNTHETIC'
                  ? 'Synthetic software demonstration; no independent physical, financial or field verification.'
                  : 'Policy or research scope is documented here; external outcomes remain unverified.',
              ]}
            />
          </section>
        ))}
        <section id="review">
          <h2>Review and submission status</h2>
          <p>
            Technical reports, test logs and owner acceptance are distinct records. No test totals
            or external achievements are invented on this page. Review the repository’s engineering
            evidence and competition drafts with the project owner; do not treat a draft as a
            submitted artifact.
          </p>
          <Link className="button" href="/demo">
            Open the scenario showroom
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
