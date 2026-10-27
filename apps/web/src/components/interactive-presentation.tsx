'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Wordmark } from '@/components/brand';
import { EvidenceNotice } from '@/components/evidence-notice';
import { FinancialSimulator } from '@/components/financial-simulator';
import {
  type PresentationScene,
  presentationProgressKey,
  presentationScenes,
} from '@/lib/presentation-scenes';
import styles from './interactive-presentation.module.css';

const workflowDetails = [
  'The buyer request and accepted quotation establish the commercial terms.',
  'Declared capacity and feasibility inform explicit production offers.',
  'Only the artisan’s authorized acceptance creates their production commitment.',
  'Progress records and quality review distinguish submitted from approved units.',
  'Buyer acceptance and financial obligations remain separate from bank settlement.',
];

function SceneVisual({ scene }: { scene: PresentationScene }) {
  const [stage, setStage] = useState(0);
  if (scene.id === 'workflow') {
    return (
      <div className={styles.workflow}>
        <fieldset className={styles.stages} aria-label="Explore workflow stages">
          {scene.points.map((point, index) => (
            <button
              type="button"
              key={point}
              aria-pressed={stage === index}
              onClick={() => setStage(index)}
            >
              <span>0{index + 1}</span>
              {point}
            </button>
          ))}
        </fieldset>
        <p className={styles.stageDetail} aria-live="polite">
          {workflowDetails[stage]}
        </p>
      </div>
    );
  }
  if (scene.id === 'technology') {
    return (
      <figure className={styles.architecture} aria-label="Website runtime architecture">
        <div className={styles.architectureTop}>
          <div>
            <small>INTERFACES</small>
            <strong>Next.js</strong>
            <span>Role workspaces · public traceability</span>
          </div>
          <div>
            <small>SESSION BOUNDARY</small>
            <strong>Better Auth</strong>
            <span>Authenticated identity · tenant scope</span>
          </div>
        </div>
        <span className={styles.connector} aria-hidden="true">
          ↓
        </span>
        <div>
          <small>BUSINESS AUTHORITY</small>
          <strong>NestJS domain APIs</strong>
          <span>Procurement · production · quality · inventory · finance</span>
        </div>
        <span className={styles.connector} aria-hidden="true">
          ↓
        </span>
        <div>
          <small>TRANSACTIONAL PERSISTENCE</small>
          <strong>Prisma → PostgreSQL</strong>
          <span>Constraints · immutable records · audit history</span>
        </div>
        <figcaption>
          Actual website stack. AI and wearable validation are outside this runtime.
        </figcaption>
      </figure>
    );
  }
  return (
    <ol className={`${styles.points} ${scene.id === 'concept' ? styles.chain : ''}`}>
      {scene.points.map((point, index) => (
        <li key={point}>
          <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <strong>{point}</strong>
        </li>
      ))}
    </ol>
  );
}

export function InteractivePresentation() {
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusScene = useRef(false);
  const scene = presentationScenes[current];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(presentationProgressKey);
      if (saved !== null && /^(?:[0-9])$/.test(saved)) setCurrent(Number(saved));
    } catch {
      // Storage is optional. Presenting remains available when the browser blocks it.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(presentationProgressKey, String(current));
    } catch {
      /* optional */
    }
    if (focusScene.current) {
      heading.current?.focus({ preventScroll: true });
      focusScene.current = false;
    }
  }, [current, ready]);

  const go = useCallback(
    (next: number) => {
      const bounded = Math.min(presentationScenes.length - 1, Math.max(0, next));
      if (bounded === current) return;
      focusScene.current = true;
      setCurrent(bounded);
      setNotice('');
    },
    [current],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat)
        return;
      if (event.key === 'Escape' && document.fullscreenElement === root.current) {
        // Browser-native Escape remains available; explicitly exit for environments that
        // deliver Escape to the document without automatically leaving fullscreen.
        void document.exitFullscreen().catch(() => {
          setNotice('Use Exit fullscreen or your browser’s fullscreen command to leave.');
        });
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, button, a, summary, [role="button"], [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]',
        )
      )
        return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.code === 'Space') {
        event.preventDefault();
        go(current + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        go(current - 1);
      }
      // No Escape event is prevented or propagation-trapped.
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [current, go]);

  useEffect(() => {
    function syncFullscreen() {
      const active = document.fullscreenElement === root.current;
      setFullscreen(active);
      // Notes never carry into a new projected audience view.
      if (active) {
        setNotes(false);
        heading.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen && document.fullscreenEnabled) {
        setNotes(false);
        await root.current.requestFullscreen();
      } else
        setNotice(
          'Fullscreen is unavailable in this browser. The presentation controls still work.',
        );
    } catch {
      setNotice(
        'Fullscreen could not start. Continue here, or use your browser’s fullscreen command.',
      );
    }
  }

  return (
    <div ref={root} className={styles.presentation} data-presentation-scene={scene.id}>
      <header className={styles.header}>
        <Wordmark light />
        <nav aria-label="Presentation navigation">
          <Link href="/">Concept</Link>
          <Link href="/demo">Live demo</Link>
          <Link href="/evidence">Evidence</Link>
        </nav>
      </header>
      <main id="main-content" className={styles.main}>
        <div className={styles.intro}>
          <h1>A prototype you can inspect.</h1>
          <span>NASJ / INTERACTIVE PRESENTATION</span>
        </div>
        {presentationScenes.map((item, index) => (
          <article
            data-presentation-slide={item.id}
            className={styles.scene}
            key={item.id}
            data-scene-active={current === index}
            aria-labelledby={`scene-${item.id}`}
          >
            <div className={styles.copy}>
              <p className={styles.eyebrow}>{item.eyebrow}</p>
              <h2
                id={`scene-${item.id}`}
                ref={index === current ? heading : undefined}
                tabIndex={-1}
              >
                {item.title}
              </h2>
              <p className={styles.message}>{item.message}</p>
              <p className={styles.body}>{item.body}</p>
              {item.id === 'demo' && (
                <Link className={styles.action} href="/demo">
                  Open the working isolated demo <span aria-hidden="true">↗</span>
                </Link>
              )}
              {item.id === 'roadmap' && (
                <Link className={styles.action} href="/evidence#limitations">
                  Inspect the evidence and next gates <span aria-hidden="true">↗</span>
                </Link>
              )}
              {item.id === 'finance' && (
                <Link className={styles.action} href="/simulator">
                  Open the complete financial comparison <span aria-hidden="true">↗</span>
                </Link>
              )}
              <EvidenceNotice
                compact
                claimId={`presentation.${item.id}`}
                claimType={item.label}
                status={item.status}
                sourceReference={item.source}
              />
            </div>
            <div className={styles.visual}>
              <SceneVisual scene={item} />
            </div>
          </article>
        ))}
        {scene.id === 'finance' && (
          <div className={styles.simulator}>
            <FinancialSimulator compact />
          </div>
        )}
        <p className={styles.srOnly} role="status" aria-live="polite">
          Scene {current + 1} of {presentationScenes.length}: {scene.label}
        </p>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {notes && (
          <aside className={styles.notes} aria-label="Presenter notes" id="presenter-notes">
            <p className={styles.eyebrow}>PRESENTER VIEW · visible on this screen</p>
            <h2>{scene.label} — speaker notes</h2>
            <dl>
              <dt>Objective</dt>
              <dd>{scene.objective}</dd>
              <dt>Main message</dt>
              <dd>{scene.message}</dd>
              <dt>Suggested narration</dt>
              <dd>{scene.narration}</dd>
              <dt>Timing</dt>
              <dd>{scene.timing}</dd>
              <dt>Demo action</dt>
              <dd>{scene.action}</dd>
              <dt>Supporting evidence</dt>
              <dd>{scene.evidence}</dd>
              <dt>Limitations</dt>
              <dd>{scene.limitation}</dd>
            </dl>
          </aside>
        )}
      </main>
      <footer className={styles.controls}>
        <div className={styles.progress}>
          <label htmlFor="presentation-progress">
            Scene {current + 1} / {presentationScenes.length} · {scene.label}
          </label>
          <progress
            id="presentation-progress"
            value={current + 1}
            max={presentationScenes.length}
          />
        </div>
        <div className={styles.controlRow}>
          <div className={styles.move}>
            <button type="button" disabled={current === 0} onClick={() => go(current - 1)}>
              ← Previous
            </button>
            <button
              type="button"
              disabled={current === presentationScenes.length - 1}
              onClick={() => go(current + 1)}
            >
              Next →
            </button>
          </div>
          <label className={styles.jump}>
            Go to scene
            <select
              aria-label="Go to scene"
              value={current}
              onChange={(event) => go(Number(event.target.value))}
            >
              {presentationScenes.map((item, index) => (
                <option key={item.id} value={index}>
                  {index + 1}. {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.utilities}>
            <button type="button" onClick={toggleFullscreen}>
              {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            </button>
            <button
              type="button"
              aria-expanded={notes}
              aria-controls="presenter-notes"
              onClick={() => setNotes(!notes)}
            >
              {notes ? 'Hide speaker notes' : 'Show speaker notes on this screen'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNotes(false);
                go(0);
              }}
            >
              Restart
            </button>
          </div>
        </div>
        <p className={styles.hint}>
          Arrow keys / Space to navigate · Esc exits fullscreen · Only the scene number is saved on
          this browser. Notes start hidden.
        </p>
      </footer>
    </div>
  );
}
