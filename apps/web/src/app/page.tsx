import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter, Weave, Wordmark } from '@/components/brand';
import { EvidenceNotice } from '@/components/evidence-notice';

const ecosystem = [
  {
    tone: 'light',
    title: 'Commercial buyers',
    text: 'The proposal starts with a product brief, quantities, delivery needs and an explicit quotation rather than a promise of available supply.',
  },
  {
    tone: 'dark',
    title: 'A managed production workflow',
    text: 'Scoped operators assess declared capacity, prepare costed offers and track production, quality and custody in a synthetic software demonstration.',
  },
  {
    tone: 'light',
    title: 'Association coordinators',
    text: 'Coordinators can assist assigned artisans within consent and organization permissions. A coordinator report is separate from an artisan’s direct decision.',
  },
  {
    tone: 'light',
    title: 'Artisan choice',
    text: 'Authenticated artisans review work, compensation and terms before accepting. Unverified accountless acceptance remains pending and cannot create a commitment.',
  },
];
const crafts = [
  { name: 'Embroidery', detail: 'Initial product and production hypothesis', swatch: 'forest' },
  { name: 'Textile weaving', detail: 'Reference craft vocabulary', swatch: 'terracotta' },
  { name: 'Basket making', detail: 'Reference craft vocabulary', swatch: 'gold' },
  { name: 'Pottery', detail: 'Reference craft vocabulary', swatch: 'charcoal' },
  { name: 'Other crafts', detail: 'Reference craft vocabulary', swatch: 'ring' },
];
export default function Home() {
  return (
    <>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Main">
          <a href="#how">Workflow</a>
          <Link href="/evidence">Evidence</Link>
          <Link href="/presentation">Presentation</Link>
        </nav>
        <div className="site-header-actions">
          <Link className="button secondary" href="/auth/login">
            Sign in
          </Link>
          <Link className="button" href="/demo">
            Explore demo
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="kicker">NASJ · a Tunisian artisan-production concept</p>
            <h1>
              Craft, with
              <br />a clearer path to market.
            </h1>
            <p className="lead">
              A managed B2B approach to connect commercial product requests with artisan production
              networks. Our starting hypothesis is Tunisian embroidery, coordinated through
              associations while preserving each artisan’s voluntary decision.
            </p>
            <EvidenceNotice
              claimId="landing.market-hypothesis"
              claimType="Market-access hypothesis"
              status="PROPOSED"
              limitations={[
                'Buyer demand, artisan income benefits and production economics require field research. No verified field outcomes are claimed.',
              ]}
            />
            <div className="action-row">
              <Link className="button large" href="/demo">
                Explore the synthetic demo <span aria-hidden="true">→</span>
              </Link>
              <Link className="button secondary large" href="/evidence">
                Evidence and limitations
              </Link>
            </div>
            <ul className="values" aria-label="Design intentions">
              <li>Voluntary participation</li>
              <li>Scoped coordination</li>
              <li>Traceable decisions</li>
            </ul>
          </div>
          <div className="hero-visual">
            <div className="arch">
              <Image
                src="/brand/artisan-weaving.jpg"
                alt="Illustrative photograph of hands weaving a patterned textile; not a documented NASJ participant"
                width={685}
                height={753}
                fetchPriority="high"
                sizes="(max-width: 750px) 100vw, 520px"
              />
            </div>
            <p className="story-card">
              <Image src="/brand/nasj-mark.png" alt="" width={36} height={38} />
              <span>
                <strong>A craft-inspired concept.</strong> This representative image is not
                participant or field-validation evidence.
              </span>
            </p>
          </div>
        </section>
        <Weave />
        <section className="section" id="how">
          <div className="section-intro">
            <p className="kicker">The managed supply-chain track</p>
            <h2>From a product request to accountable production.</h2>
            <p className="lead">
              The software connects quotation, artisan offers, production tracking, quality checks
              and logistics. The demonstration uses fictional organizations and synthetic commercial
              records.
            </p>
          </div>
          <EvidenceNotice
            claimId="landing.software-workflow"
            claimType="Implemented software workflow"
            status="SYNTHETIC"
            sourceReference="/evidence#software"
            limitations={[
              'Working application workflows are demonstrated with controlled synthetic inputs. Software checks do not establish live operational readiness, partner endorsement or delivery reliability.',
            ]}
          />
          <div className="card-grid">
            {ecosystem.map((item) => (
              <article key={item.title} className={`eco-card eco-${item.tone}`}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="section" id="start">
          <div className="section-intro">
            <p className="kicker">What the prototype can demonstrate</p>
            <h2>Follow decisions, quantities and obligations.</h2>
          </div>
          <div className="paths">
            <article className="path">
              <h3>A commercial production journey</h3>
              <EvidenceNotice
                compact
                claimId="landing.commercial-journey"
                claimType="Commercial demonstration"
                status="SYNTHETIC"
                sourceReference="/evidence#scenario"
              />
              <ol className="steps">
                <li>
                  <strong>Define and quote the work.</strong> Review product requirements, declared
                  capacity, feasibility assumptions and exact TND costing.
                </li>
                <li>
                  <strong>Offer work voluntarily.</strong> Authenticated artisans review
                  compensation and accept their own offers. Accountless reports stay blocked pending
                  an approved method.
                </li>
                <li>
                  <strong>Track production and custody.</strong> Record progress, quality-approved
                  quantities, material handovers, shipments and buyer-confirmed receipt through
                  scoped workspaces.
                </li>
              </ol>
            </article>
            <article className="path">
              <h3>Financial transparency and public traceability</h3>
              <EvidenceNotice
                compact
                claimId="landing.finance-traceability"
                claimType="Financial and traceability demonstration"
                status="SYNTHETIC"
                sourceReference="/evidence#payments"
                limitations={[
                  'Simulations are not bank transfers. Manual material records are not independently verified physical stock. Agreed producer share is not verified paid income.',
                ]}
              />
              <ol className="steps">
                <li>
                  <strong>Keep obligations visible.</strong> Recognized payables, separate payout
                  approvals and dispute history preserve unresolved artisan claims.
                </li>
                <li>
                  <strong>Review the QR story.</strong> Published craft summaries and privacy-aware
                  producer-share calculations retain their synthetic label.
                </li>
                <li>
                  <strong>Show the blockers.</strong> Deposits and payout reports stay unverified
                  without approved evidence. Financial closure remains blocked while required
                  evidence or obligations are missing.
                </li>
              </ol>
            </article>
          </div>
          <div className="coming-next">
            <div>
              <h3>What still needs validation</h3>
              <EvidenceNotice
                compact
                claimId="landing.future-validation"
                claimType="Field-validation and rollout plans"
                status="PROPOSED"
                sourceReference="/evidence#limitations"
                limitations={[
                  'No validated partner network, verified artisan-count metric, income uplift, delivery guarantee, approved live bank settlement or pilot readiness is claimed.',
                ]}
              />
              <p>
                Field research, commercial agreements, physical-stock verification, payment
                evidence, tax policy and owner acceptance remain separate gates.
              </p>
            </div>
          </div>
        </section>
        <section className="crafts" id="crafts">
          <div className="section">
            <div className="section-intro">
              <p className="kicker">A focused starting point</p>
              <h2>Embroidery first, broader crafts as a hypothesis.</h2>
            </div>
            <EvidenceNotice
              claimId="landing.craft-scope"
              claimType="Product-scope hypothesis"
              status="PROPOSED"
              limitations={[
                'The craft list is reference vocabulary, not a count of active producers or a catalogue of verified supply.',
              ]}
            />
            <ul className="craft-grid">
              {crafts.map((craft) => (
                <li key={craft.name}>
                  <span className={`swatch ${craft.swatch}`} aria-hidden="true" />
                  <strong>{craft.name}</strong>
                  <span>{craft.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="section" id="safety">
          <div className="section-intro">
            <p className="kicker">Optional, separate research track</p>
            <h2>A local safety companion concept.</h2>
            <p>
              Wearable safety support is a separate proposed research direction. Any local safety
              simulation remains outside the commerce API; individual health or monitoring data must
              not determine work eligibility, pay or public traceability.
            </p>
          </div>
          <EvidenceNotice
            claimId="landing.local-safety"
            claimType="Optional local safety concept"
            status="PROPOSED"
            sourceReference="/evidence#safety"
            limitations={[
              'No clinical injury-prevention result, certified device, hardware deployment or health-effectiveness claim is established.',
            ]}
          />
        </section>
        <section className="cta-band">
          <div className="section">
            <div>
              <h2>Explore the implementation, with its limits.</h2>
              <p>
                The demo is synthetic. Review sources and blockers before drawing conclusions about
                real-world use.
              </p>
            </div>
            <div className="action-row">
              <Link className="button gold large" href="/demo">
                Open demo
              </Link>
              <Link className="button outline-light large" href="/presentation">
                Presentation mode
              </Link>
            </div>
          </div>
          <Weave />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
