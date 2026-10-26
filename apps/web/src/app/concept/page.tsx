import { ArrowDown, ArrowRight, Check, CircleHelp, Layers3, ShieldCheck } from 'lucide-react';
import { EvidenceBadge, EvidenceClaim } from '@/components/evidence/evidence-badge';
import { LandingNav } from '@/components/landing/landing-nav';
import { landingContent, presentationModePath } from '@/lib/landing-content';

export default function ConceptPage() {
  return (
    <div
      className="min-h-screen overflow-x-clip bg-background text-foreground dark:bg-[#101916] dark:text-slate-100"
      id="top"
    >
      <LandingNav />
      <main id="main-content">
        <section className="relative isolate overflow-hidden border-b border-border bg-background dark:border-slate-700 dark:bg-[#101916]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-10 -z-10 h-72 w-72 rounded-full border-[32px] border-accent/70 dark:border-emerald-900/60 sm:right-8 sm:top-16 sm:h-96 sm:w-96"
          />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <EvidenceBadge status="proposed" />
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-300">
                  {landingContent.hero.eyebrow}
                </p>
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                {landingContent.hero.title}
              </h1>
              <div className="mt-6 max-w-2xl">
                <EvidenceClaim claim={landingContent.brand} />
                <div className="mt-4">
                  <EvidenceClaim claim={landingContent.hero.claim} />
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {landingContent.callsToAction.map((action) => (
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    href={action.href}
                    key={action.href}
                  >
                    {action.label}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </a>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground dark:text-slate-300">
                {landingContent.callsToAction.map((action) => action.description).join(' ')}
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <EvidenceBadge status="proposed" />
                <p className="m-0 text-sm font-semibold">A proposed sequence</p>
                <Layers3
                  aria-hidden="true"
                  className="h-5 w-5 text-primary dark:text-emerald-300"
                />
              </div>
              <ol className="space-y-3">
                {landingContent.workflow.map((step, index) => (
                  <li className="flex min-w-0 items-center gap-3" key={step.number}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground dark:bg-emerald-950 dark:text-emerald-100">
                      {step.number}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{step.title}</span>
                    <EvidenceBadge status={step.claim.status} />
                    {index < landingContent.workflow.length - 1 ? (
                      <ArrowDown
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground dark:text-slate-400"
                      />
                    ) : (
                      <Check
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-primary dark:text-emerald-300"
                      />
                    )}
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t border-border pt-4 dark:border-slate-700">
                <EvidenceClaim claim={landingContent.workflow[4].claim} />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="problem-heading"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
          id="problem"
        >
          <div className="mb-8 max-w-2xl">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary dark:text-emerald-300">
              The problem to explore
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="problem-heading">
              Start with the people doing the work.
            </h2>
            <p className="text-base text-muted-foreground dark:text-slate-300">
              These are questions for discovery, not claims that the market has already confirmed.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {landingContent.problems.map((problem) => (
              <article
                className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                key={problem.id}
              >
                <h3 className="text-xl font-semibold">{problem.title}</h3>
                <EvidenceClaim claim={problem.claim} />
                <p className="mb-0 mt-5 flex gap-2 border-t border-border pt-4 text-sm text-muted-foreground dark:border-slate-700 dark:text-slate-300">
                  <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {problem.prompt}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="model-heading"
          className="bg-[#f0f4f3] py-16 dark:bg-[#17231e] sm:py-20"
          id="model"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary dark:text-emerald-300">
                  The managed supply model
                </p>
                <h2
                  className="text-3xl font-semibold tracking-tight sm:text-4xl"
                  id="model-heading"
                >
                  One clear step at a time.
                </h2>
              </div>
              <div className="max-w-xl">
                <EvidenceClaim claim={landingContent.workflowNote} />
              </div>
            </div>
            <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {landingContent.workflow.map((step) => (
                <li
                  className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  key={step.number}
                >
                  <p className="mb-4 text-xs font-bold tracking-[0.15em] text-primary dark:text-emerald-300">
                    STEP {step.number}
                  </p>
                  <h3 className="min-h-12 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground dark:text-slate-300">
                    {step.description}
                  </p>
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wide">
                    Who acts: {step.actor}
                  </p>
                  <EvidenceClaim claim={step.claim} />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="tracks-heading"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
          id="tracks"
        >
          <div className="mb-8 max-w-2xl">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary dark:text-emerald-300">
              Two tracks, different roles
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="tracks-heading">
              Keep the core focused.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {landingContent.tracks.map((track) => (
              <article
                className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8"
                key={track.id}
              >
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary dark:text-emerald-300">
                  {track.label}
                </p>
                <h3 className="text-2xl font-semibold">{track.title}</h3>
                <p className="text-base leading-7 text-muted-foreground dark:text-slate-300">
                  {track.description}
                </p>
                <EvidenceClaim claim={track.claim} />
              </article>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-muted p-4 dark:border-slate-700 dark:bg-slate-800">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-emerald-300"
            />
            <div>
              <h3 className="mb-1 text-sm font-semibold">A firm boundary</h3>
              <EvidenceClaim claim={landingContent.boundaries[2].claim} />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="evidence-heading"
          className="bg-[#f0f4f3] py-16 dark:bg-[#17231e] sm:py-20"
          id="evidence"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-3xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary dark:text-emerald-300">
                Evidence and limits
              </p>
              <h2
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
                id="evidence-heading"
              >
                Separate what exists from what we still need to learn.
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {landingContent.discovery.map((item) => (
                <article
                  className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  key={item.id}
                >
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <EvidenceClaim claim={item.claim} />
                  {item.note && (
                    <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground dark:text-slate-300">
                      {item.note}
                    </p>
                  )}
                  {item.sources && (
                    <ul className="mt-4 space-y-1 border-t border-border pt-3 dark:border-slate-700">
                      {item.sources.map((source) => (
                        <li key={`${item.id}-${source.href}`}>
                          <a
                            className="inline-flex min-h-11 max-w-full items-center gap-2 break-words py-2 text-sm font-medium text-primary underline decoration-current underline-offset-4 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-300 dark:hover:text-emerald-100"
                            href={source.href}
                          >
                            {source.label}
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {landingContent.boundaries.map((boundary) => (
                <article
                  className="min-w-0 rounded-2xl border border-border bg-card p-5 dark:border-slate-700 dark:bg-slate-900"
                  key={boundary.id}
                >
                  <h3 className="text-base font-semibold">{boundary.title}</h3>
                  <EvidenceClaim claim={boundary.claim} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-12">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
                  Explore the prototype
                </p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  See the synthetic workflow in its current form.
                </h2>
                <div className="mt-4">
                  <EvidenceClaim claim={landingContent.boundaries[1].claim} />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                {landingContent.callsToAction.map((action) => (
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-background px-5 py-3 text-center text-sm font-semibold text-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    href={action.href}
                    key={`footer-${action.href}`}
                  >
                    {action.label}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </a>
                ))}
                <span
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary-foreground/50 px-4 text-center text-xs font-semibold"
                  data-presentation-mode={presentationModePath}
                >
                  Presentation mode · TODO(team)
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 dark:border-slate-700">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-muted-foreground dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="mb-0">HirfaCare concept</p>
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="#top"
          >
            Back to top
          </a>
        </div>
      </footer>
    </div>
  );
}
