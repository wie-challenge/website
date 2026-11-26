import { expect, test, type APIRequestContext } from '@playwright/test';
import type { DemoSessionView } from '@nasj/contracts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Records one continuous video of a single synthetic showroom scenario and timestamps the three
 * segments the Phase 1 storyboard needs (scenes 3-5). One recording, one scenario generation: cut
 * boundaries are wall-clock offsets so the clips stay causally continuous.
 *
 * Skipped unless NASJ_CLIP_DIR is set, so the normal demo suite is unaffected.
 */
const origin = 'http://127.0.0.1:3100';
const root = '/api/v1/procurement';
const clipDir = process.env.NASJ_CLIP_DIR;

async function get<T>(api: APIRequestContext, path: string): Promise<T> {
  const response = await api.get(path);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function post<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const demo = path.startsWith('/api/v1/demo/');
  const context = await get<{ csrfToken: string }>(
    api,
    demo ? '/api/v1/demo/session' : '/api/v1/me',
  );
  const response = await api.post(path, {
    data,
    headers: {
      Origin: origin,
      [demo ? 'X-Demo-CSRF' : 'X-CSRF-Token']: context.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
    },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
type Versioned = { id: string; version: number; termsSha256: string };
type Execution = {
  batches: { id: string; version: number }[];
  criteria: { id: string }[];
  preparations: { items: { id: string }[] }[];
};

test('records storyboard clips for scenes 3-5 from one scenario', async ({ browser }) => {
  test.skip(!clipDir, 'Set NASJ_CLIP_DIR to record storyboard clips.');
  test.setTimeout(420_000);
  const directory = clipDir as string;
  await mkdir(directory, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: join(directory, 'raw'), size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());

  const started = Date.now();
  const marks: { name: string; start: number; end?: number }[] = [];
  const mark = (name: string) => marks.push({ name, start: Date.now() - started });
  const close = () => {
    const last = marks.at(-1);
    if (last && last.end === undefined) last.end = Date.now() - started;
  };

  async function settle() {
    await expect(page.locator('.resource-loading:visible')).toHaveCount(0);
    await expect(
      page.getByText('Loading workspace…', { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Loading your demo scenario…')).toBeHidden();
  }
  async function show(path: string, tab?: string, demo = true) {
    await page.goto(path);
    if (demo)
      await expect(
        page.getByRole('complementary', { name: 'Synthetic demo session' }),
      ).toBeVisible();
    await settle();
    if (tab) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
    await settle();
  }
  async function switchShared(persona: string) {
    const next = await post<DemoSessionView>(page.request, '/api/v1/demo/switch', { persona });
    expect(next.activePersona).toBe(persona);
    return next;
  }

  await page.goto('/demo');
  await page.getByRole('button', { name: 'Start Demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset Demo', exact: true })).toBeVisible();
  let state = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  const scenario = state.scenario!;

  // --- Scene 3: the artisan's decision -------------------------------------------------
  mark('scene3');
  await page
    .getByRole('button', { name: 'Explore Synthetic buyer representative', exact: true })
    .click();
  await expect(page).toHaveURL(/\/buyer$/);
  await page.goto(`/procurement/${scenario.rfqId}`);
  await settle();
  await page.getByRole('tab', { name: 'Quotes', exact: true }).click();
  await page.getByRole('checkbox', { name: /I approve this exact/ }).check();
  await page.getByRole('button', { name: 'Accept quotation v1', exact: true }).click();
  await expect(page.getByText(/ACCEPTED\./)).toBeVisible();
  await page.waitForTimeout(1200);
  state = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  const orderId = state.scenario!.orderId!;
  await expect(page.getByTestId('demo-banner-order-id')).toHaveText(orderId, { timeout: 15000 });

  for (const persona of state.personas) await switchShared(persona.id);
  await switchShared('production');
  // /procurement/[id] is the RFQ page; an order id there 404s the fixture request.
  const assessed = await post<{
    summary: { orderVersion: number };
    assessments: { id: string; artisanProfileId: string; decision: string }[];
  }>(page.request, `${root}/orders/${orderId}/eligibility-assessments`, {
    version: 1,
    restrictionsReviewed: true,
    restrictionSource: 'Synthetic versioned showroom product file',
  });
  const linked = assessed.assessments.find((a) => a.artisanProfileId === scenario.linkedArtisanId)!;
  await page.goto(`/procurement/${scenario.rfqId}`);
  await settle();
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  await page.waitForTimeout(900);
  const offer = await post<Versioned>(page.request, `${root}/orders/${orderId}/offers`, {
    version: assessed.summary.orderVersion,
    quantity: 10,
    expiresAt: scenario.offerExpiresAt,
    materials: 'Synthetic thread supplied by operator',
    reworkTerms: 'New voluntary agreement required',
    paymentConditions: 'Recognize buyer accepted pieces; no bank evidence',
    collectionArrangement: 'Synthetic association pickup',
    instructions: 'Follow the synthetic approved sample',
    eligibilityId: linked.id,
  });
  await post<Versioned>(page.request, `${root}/offers/${offer.id}/issue`, {
    version: offer.version,
  });

  // The artisan view: terms, compensation and the independent decision controls.
  await switchShared('artisan');
  await show('/commerce/artisan');
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: 'Accept this offer voluntarily', exact: true })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.getByRole('checkbox', { name: /understand/i }).check();
  await page.getByRole('button', { name: 'Accept this offer voluntarily', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Artisan offer · Accepted', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1800);
  // The accountless blocker: a coordinator report that stays pending and creates no commitment.
  await switchShared('coordinator');
  await show('/commerce/artisan');
  await page.waitForTimeout(2000);
  close();

  // --- Scene 4: production, quality and custody ----------------------------------------
  mark('scene4');
  await switchShared('production');
  let execution = await get<Execution>(page.request, `${root}/orders/${orderId}/execution`);
  const batchId = execution.batches[0].id;
  await post(page.request, `${root}/batches/${batchId}/release`, {
    version: execution.batches[0].version,
    fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
    materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
  });
  await switchShared('artisan');
  await show('/commerce/artisan');
  await page.waitForTimeout(1200);
  const work = await get<{ items: { batchId: string; version: number }[] }>(
    page.request,
    `${root}/my-batches`,
  );
  const start = await post<{ version: number }>(page.request, `${root}/batches/${batchId}/start`, {
    version: work.items[0].version,
  });
  const progress = await post<{ version: number }>(
    page.request,
    `${root}/batches/${batchId}/progress`,
    { version: start.version, produced: 10, occurredAt: new Date().toISOString() },
  );
  await post(page.request, `${root}/batches/${batchId}/submit`, { version: progress.version });
  await page.reload();
  await settle();
  await page.waitForTimeout(1600);
  await switchShared('qa');
  await page.goto(`/procurement/${scenario.rfqId}`);
  await settle();
  await page.getByRole('tab', { name: 'Production', exact: true }).click();
  await expect(page.getByText('Production quantities', { exact: true })).toBeVisible();
  await page.waitForTimeout(1400);
  execution = await get<Execution>(page.request, `${root}/orders/${orderId}/execution`);
  await post(page.request, `${root}/batches/${batchId}/inspections`, {
    version: execution.batches[0].version,
    approved: 10,
    rejected: 0,
    pending: 0,
    results: execution.criteria.map((c) => ({
      criterionId: c.id,
      outcome: 'PASS',
      note: 'Synthetic inspection only',
    })),
  });
  await post(page.request, `${root}/orders/${orderId}/consolidations`, {
    items: [{ batchId, quantity: 10 }],
  });
  await page.reload();
  await settle();
  await page.waitForTimeout(1800);

  execution = await get<Execution>(page.request, `${root}/orders/${orderId}/execution`);
  await switchShared('coordinator');
  const coordinator = await get<{ user: { id: string } }>(page.request, '/api/v1/me');
  await switchShared('production');
  const shipment = await post<{ id: string }>(page.request, `${root}/orders/${orderId}/shipments`, {
    items: [{ preparationItemId: execution.preparations[0].items[0].id, quantity: 10 }],
    hub: 'Synthetic association hub',
    windowStart: new Date(Date.now() + 3600000).toISOString(),
    windowEnd: new Date(Date.now() + 7200000).toISOString(),
    coordinatorId: coordinator.user.id,
  });
  await switchShared('coordinator');
  await show(`/procurement/${scenario.rfqId}`);
  await page.waitForTimeout(1200);
  const collection = await post<{ version: number }>(
    page.request,
    `${root}/shipments/${shipment.id}/handovers`,
    {
      version: 1,
      eventType: 'COLLECTED_FROM_ASSOCIATION',
      quantity: 10,
      occurredAt: new Date().toISOString(),
    },
  );
  await switchShared('production');
  const details = await get<{ handovers: { id: string }[] }>(
    page.request,
    `${root}/shipments/${shipment.id}`,
  );
  const hub = await post<{ version: number }>(
    page.request,
    `${root}/shipments/${shipment.id}/handovers`,
    {
      version: collection.version,
      eventType: 'RECEIVED_AT_HUB',
      quantity: 10,
      occurredAt: new Date().toISOString(),
      priorHandoverId: details.handovers[0].id,
    },
  );
  const dispatch = await post<{ version: number }>(
    page.request,
    `${root}/shipments/${shipment.id}/handovers`,
    {
      version: hub.version,
      eventType: 'HANDED_TO_TRANSPORT',
      quantity: 10,
      occurredAt: new Date().toISOString(),
    },
  );
  const delivered = await post<{ version: number }>(
    page.request,
    `${root}/shipments/${shipment.id}/delivery-reports`,
    { version: dispatch.version, quantity: 10, occurredAt: new Date().toISOString() },
  );
  await page.goto(`/procurement/${scenario.rfqId}`);
  await settle();
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  await page.waitForTimeout(2200);
  close();
  // --- Scene 5: buyer receipt, traceability and money ----------------------------------
  mark('scene5');
  await switchShared('buyer');
  await post(page.request, `${root}/shipments/${shipment.id}/buyer-confirmations`, {
    version: delivered.version,
    received: 10,
    accepted: 10,
    missing: 0,
    occurredAt: new Date().toISOString(),
  });
  await page.goto(`/procurement/${scenario.rfqId}`);
  await settle();
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  await page.waitForTimeout(1600);
  await switchShared('production');
  const trace = await post<{ id: string }>(page.request, `${root}/orders/${orderId}/traceability`, {
    story:
      'Synthetic Tunisian embroidery following the approved demonstration sample and coarse regional origin.',
  });
  await post(page.request, `${root}/traceability/${trace.id}/submit-review`, {
    reason: 'Review synthetic privacy safe story',
  });
  const publication = await post<{ publicPath: string }>(
    page.request,
    `${root}/traceability/${trace.id}/publish`,
    { reason: 'Publish approved synthetic craft description' },
  );
  await show(publication.publicPath, undefined, false);
  await expect(page.getByText('Provenance: synthetic demonstration.')).toBeVisible();
  await expect(page.getByText('The percentage is withheld.')).toBeVisible();
  await page.waitForTimeout(2200);
  await post(page.request, `${root}/orders/${orderId}/payables/reconcile`, {
    milestone: 'BUYER_ACCEPTED_PIECE',
  });
  await switchShared('finance');
  await page.goto('/operator/finance');
  await settle();
  const financeForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Open order finances', exact: true }),
  });
  await financeForm
    .getByRole('textbox', { name: 'Commercial order reference', exact: true })
    .fill(orderId);
  await financeForm.getByRole('button', { name: 'Open order finances', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Financial controls and closure', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Loading…', { exact: true })).toBeHidden();
  await page.waitForTimeout(900);
  // The point of the scene is the recognized-obligation ledger, which sits below the fold.
  const obligations = page.getByRole('heading', {
    name: 'Recognized artisan obligations',
    exact: true,
  });
  await expect(obligations).toBeVisible();
  await obligations.evaluate((element) => {
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy({ top: -180, behavior: 'instant' });
  });
  await page.waitForTimeout(3000);
  close();

  await context.close();

  const video = page.video();
  const rawPath = video ? await video.path() : null;
  expect(rawPath).toBeTruthy();
  await writeFile(
    join(directory, 'clips.json'),
    `${JSON.stringify(
      {
        raw: rawPath,
        scenarioId: scenario.id,
        generation: scenario.generation,
        recordedAt: new Date().toISOString(),
        marks,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`CLIPS_JSON=${join(directory, 'clips.json')}`);
});
