import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter, Weave, Wordmark } from '@/components/brand';
const ecosystem = [
  {
    tone: 'light',
    title: 'Companies',
    text: 'Need employee gifts, event gifts and CSR initiatives that mean something.',
  },
  {
    tone: 'dark',
    title: 'NASJ, the connector',
    text: 'Verifies every organization and connects buyers with the associations and artisans behind each craft.',
  },
  {
    tone: 'light',
    title: 'Associations & cooperatives',
    text: 'Bring their artisans together and coordinate access to handmade products.',
  },
  {
    tone: 'light',
    title: 'Rural women artisans',
    text: 'Gain new customers, paid work and recognition for their craftsmanship.',
  },
];
// Mirrors the reference craft vocabulary seeded by the API (CraftSkill).
const crafts = [
  { name: 'Embroidery', detail: 'Embroidery and decorative stitching', swatch: 'forest' },
  { name: 'Textile weaving', detail: 'Traditional textile weaving', swatch: 'terracotta' },
  { name: 'Basket making', detail: 'Basketry and woven plant fibers', swatch: 'gold' },
  { name: 'Pottery', detail: 'Traditional pottery', swatch: 'charcoal' },
  { name: 'Other crafts', detail: 'Other traditional craft skills', swatch: 'ring' },
];
export default function Home() {
  return (
    <>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#start">Get started</a>
          <a href="#crafts">Crafts</a>
        </nav>
        <div className="site-header-actions">
          <Link className="button secondary" href="/auth/login">
            Sign in
          </Link>
          <Link className="button" href="/auth/register">
            Create an account
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="kicker">Social-impact gifting platform</p>
            <h1>
              Meaningful gifts.
              <br />
              Greater impact.
            </h1>
            <p className="lead">
              NASJ connects companies with rural women artisans and the associations that support
              them, turning employee gifts, event gifts and CSR budgets into paid work and
              visibility for handmade craft.
            </p>
            <div className="action-row">
              <Link className="button large" href="/auth/register">
                Create an account <span aria-hidden="true">→</span>
              </Link>
              <Link className="button secondary large" href="/auth/login">
                Sign in
              </Link>
            </div>
            <ul className="values" aria-label="Our values">
              <li>Authenticity</li>
              <li>Community</li>
              <li>Sustainability</li>
              <li>Growth</li>
            </ul>
          </div>
          <div className="hero-visual">
            <div className="arch">
              <Image
                src="/brand/artisan-weaving.jpg"
                alt="Hands of a woman artisan weaving a patterned textile"
                width={685}
                height={753}
                fetchPriority="high"
                sizes="(max-width: 750px) 100vw, 520px"
              />
            </div>
            <p className="story-card">
              <Image src="/brand/nasj-mark.png" alt="" width={36} height={38} />
              <span>
                <strong>Every thread tells a story.</strong> Behind each piece is a woman artisan
                and her community.
              </span>
            </p>
          </div>
        </section>
        <Weave />
        <section className="section" id="how">
          <div className="section-intro">
            <p className="kicker">The NASJ ecosystem</p>
            <h2>One order, woven through three communities.</h2>
            <p className="lead">
              NASJ isn’t about donating money or buying generic merchandise. It turns purchasing
              companies already do into practical, paid opportunities for women artisans.
            </p>
          </div>
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
            <p className="kicker">Get started</p>
            <h2>What you can set up today.</h2>
          </div>
          <div className="paths">
            <article className="path">
              <h3>Companies &amp; associations</h3>
              <ol className="steps">
                <li>
                  <strong>Create and verify your account.</strong> Sign up with your email address.
                </li>
                <li>
                  <strong>Register your organization.</strong> Choose a buyer business or an
                  association, complete the profile and submit it for approval.
                </li>
                <li>
                  <strong>Invite your team.</strong> Approved managers invite staff and assign roles
                  within the organization.
                </li>
              </ol>
            </article>
            <article className="path">
              <h3>Artisans</h3>
              <ol className="steps">
                <li>
                  <strong>Create and verify your account.</strong> A trusted association can also
                  assist you, only with your explicit consent.
                </li>
                <li>
                  <strong>Build your artisan profile.</strong> Add your crafts, skills and the
                  capacity you choose to offer.
                </li>
                <li>
                  <strong>Join an association, or stay independent.</strong> Association
                  participation is always optional.
                </li>
              </ol>
            </article>
          </div>
          <div className="coming-next">
            <span className="badge">Coming next</span>
            <p>
              Gifting orders, production coordination and fair payments for artisans, built on the
              verified organizations and artisan profiles above.
            </p>
          </div>
        </section>
        <section className="crafts" id="crafts">
          <div className="section">
            <div className="section-intro">
              <p className="kicker">Handmade by women artisans</p>
              <h2>Crafts your team will keep.</h2>
            </div>
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
        <section className="cta-band">
          <div className="section">
            <div>
              <h2>Together for greater impact.</h2>
              <p>Create your account to register an organization or an artisan profile.</p>
            </div>
            <div className="action-row">
              <Link className="button gold large" href="/auth/register">
                Create an account
              </Link>
              <Link className="button outline-light large" href="/auth/login">
                Sign in
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
