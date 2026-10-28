import { expect, test, type APIRequestContext } from '@playwright/test';
import type { DemoSessionView } from '@nasj/contracts';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const origin = 'http://127.0.0.1:3100';
const root = '/api/v1/procurement';
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
async function switchPersona(api: APIRequestContext, persona: string) {
  return post<DemoSessionView>(api, '/api/v1/demo/switch', { persona });
}

test('visitor showroom completes real synthetic commercial workflow and resets without affecting another visitor', async ({
  page,
  browser,
}) => {
  async function capture(name: string, path = '/demo') {
    const directory = process.env.BATCH7_CAPTURE_DIR;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(path);
    await expect(page.getByRole('complementary', { name: 'Synthetic demo session' })).toBeVisible();
    await expect(page.getByText('Loading your demo scenario…')).toBeHidden();
    if (path.startsWith('/procurement/')) {
      const tab = name.startsWith('02')
        ? 'Quotes'
        : name.startsWith('06')
          ? 'Delivery'
          : 'Production';
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
    if (path === '/operator/finance') {
      const current = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
      const financeForm = page.locator('form').filter({
        has: page.getByRole('button', { name: 'Open order finances', exact: true }),
      });
      await financeForm
        .getByRole('textbox', { name: 'Commercial order reference', exact: true })
        .fill(current.scenario!.orderId!);
      await financeForm.getByRole('button', { name: 'Open order finances', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Financial controls and closure', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Loading…', { exact: true })).toBeHidden();
    }
    const focus = name.startsWith('03')
      ? page.getByRole('heading', { name: 'Artisan offer · Accepted', exact: true })
      : name.startsWith('04')
        ? page.getByRole('heading', { name: 'Your production work', exact: true })
        : name.startsWith('05')
          ? page.getByRole('heading', { name: 'Production execution', exact: true })
          : name.startsWith('06')
            ? page.getByRole('heading', { name: /^Shipment · / })
            : name.startsWith('08')
              ? page.getByRole('heading', { name: 'Recognized artisan obligations', exact: true })
              : null;
    if (name.startsWith('05'))
      await expect(page.getByText('Production quantities', { exact: true })).toBeVisible();
    await expect(page.locator('.resource-loading:visible')).toHaveCount(0);
    await expect(
      page.getByText('Loading workspace…', { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    if (focus) {
      await expect(focus).toBeVisible();
      await focus.evaluate((element) => {
        element.scrollIntoView({ block: 'start', behavior: 'instant' });
        window.scrollBy({ top: -160, behavior: 'instant' });
      });
    }
    await expect(
      page.getByRole('complementary', { name: 'Synthetic demo session' }),
    ).toBeInViewport();
    await page.screenshot({ path: join(directory, `${name}.png`), fullPage: false });
  }
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Start Demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset Demo', exact: true })).toBeVisible();
  let state = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  const scenario = state.scenario!;
  await capture('01-showroom');
  const other = await browser.newContext();
  await get<DemoSessionView>(other.request, '/api/v1/demo/session');
  const second = await post<DemoSessionView>(other.request, '/api/v1/demo/start', {});
  await page
    .getByRole('button', { name: 'Explore Synthetic buyer representative', exact: true })
    .click();
  await expect(page).toHaveURL(/\/buyer$/);
  await page.goto(`/procurement/${scenario.rfqId}`);
  await page.getByRole('tab', { name: 'Quotes', exact: true }).click();
  await page.getByRole('checkbox', { name: /I approve this exact/ }).check();
  await page.getByRole('button', { name: 'Accept quotation v1', exact: true }).click();
  await expect(page.getByText(/ACCEPTED\./)).toBeVisible();
  state = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  const orderId = state.scenario!.orderId!;
  expect(orderId).toBeTruthy();
  await expect(page.getByTestId('demo-banner-order-id')).toHaveText(orderId, { timeout: 15000 });
  await capture('02-buyer-accepted', `/procurement/${scenario.rfqId}`);
  async function switchShared(persona: string) {
    const next = await switchPersona(page.request, persona);
    expect(next.activePersona).toBe(persona);
    expect(next.scenario!.id).toBe(scenario.id);
    expect(next.scenario!.generation).toBe(scenario.generation);
    expect(next.scenario!.rfqId).toBe(scenario.rfqId);
    expect(next.scenario!.orderId).toBe(orderId);
    expect(next.scenario!.totals.orders).toBe(1);
    return next;
  }
  for (const persona of state.personas) await switchShared(persona.id);
  await switchShared('production');
  const assessed = await post<{
    summary: { orderVersion: number };
    assessments: { id: string; artisanProfileId: string; decision: string }[];
  }>(page.request, `${root}/orders/${orderId}/eligibility-assessments`, {
    version: 1,
    restrictionsReviewed: true,
    restrictionSource: 'Synthetic versioned showroom product file',
  });
  const linked = assessed.assessments.find((a) => a.artisanProfileId === scenario.linkedArtisanId)!;
  expect(linked.decision).toBe('ELIGIBLE');
  const offerBody = {
    version: assessed.summary.orderVersion,
    quantity: 10,
    expiresAt: scenario.offerExpiresAt,
    materials: 'Synthetic thread supplied by operator',
    reworkTerms: 'New voluntary agreement required',
    paymentConditions: 'Recognize buyer accepted pieces; no bank evidence',
    collectionArrangement: 'Synthetic association pickup',
    instructions: 'Follow the synthetic approved sample',
  };
  const offer = await post<Versioned>(page.request, `${root}/orders/${orderId}/offers`, {
    ...offerBody,
    eligibilityId: linked.id,
  });
  const issued = await post<Versioned>(page.request, `${root}/offers/${offer.id}/issue`, {
    version: offer.version,
  });
  await switchShared('artisan');
  await post(page.request, `/api/v1/commerce/offers/${offer.id}/actions`, {
    next: 'ACCEPTED',
    version: issued.version,
    termsSha256: issued.termsSha256,
  });
  await capture('03-artisan-accepted', '/commerce/artisan');
  const acceptedState = await switchShared('production');
  expect(acceptedState.scenario!.totals.acceptedCommitments).toBe(1);
  expect(acceptedState.scenario!.totals.committedPieces).toBe(10);
  let execution = await get<Execution>(page.request, `${root}/orders/${orderId}/execution`);
  const batchId = execution.batches[0].id;
  await post(page.request, `${root}/batches/${batchId}/release`, {
    version: execution.batches[0].version,
    fundingAttestation: 'SYNTHETIC_DEMO_NOT_A_PAYMENT',
    materialAttestation: 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT',
  });
  await switchShared('artisan');
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
  await capture('04-artisan-submitted', '/commerce/artisan');
  const qaState = await switchShared('qa');
  expect(qaState.scenario!.totals.produced).toBe(10);
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
  await capture('05-quality-approved', `/procurement/${scenario.rfqId}`);
  execution = await get<Execution>(page.request, `${root}/orders/${orderId}/execution`);
  const coordinatorState = await switchShared('coordinator');
  expect(coordinatorState.scenario!.totals.qualityApproved).toBe(10);
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
  await capture('06-logistics', `/procurement/${scenario.rfqId}`);
  await switchShared('buyer');
  await post(page.request, `${root}/shipments/${shipment.id}/buyer-confirmations`, {
    version: delivered.version,
    received: 10,
    accepted: 10,
    missing: 0,
    occurredAt: new Date().toISOString(),
  });
  const safeBuyer = await get<{ payables: unknown[] }>(
    page.request,
    `/api/v1/finance/orders/${orderId}`,
  );
  expect(safeBuyer.payables).toEqual([]);
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
  await capture('07-public-traceability', publication.publicPath);
  await page.goto(publication.publicPath);
  await expect(page.getByText('Provenance: synthetic demonstration.')).toBeVisible();
  await expect(page.getByText('The percentage is withheld.')).toBeVisible();
  await post(page.request, `${root}/orders/${orderId}/payables/reconcile`, {
    milestone: 'BUYER_ACCEPTED_PIECE',
  });
  const finance = await get<{ payables: { id: string; amountTnd: string }[] }>(
    page.request,
    `/api/v1/finance/orders/${orderId}`,
  );
  const payout = await post<{ id: string }>(
    page.request,
    `/api/v1/finance/orders/${orderId}/payouts`,
    {
      payableId: finance.payables[0].id,
      amountTnd: finance.payables[0].amountTnd,
      reason: 'Synthetic governed request',
    },
  );
  const financeState = await switchShared('finance');
  expect(financeState.scenario!.totals.delivered).toBe(10);
  expect(financeState.scenario!.totals.payableMillimes).not.toBe('0');
  await capture('08-finance-payable', '/operator/finance');
  await post(page.request, `/api/v1/finance/payouts/${payout.id}/approve`, {
    reason: 'Independent synthetic checker approval',
  });
  await switchShared('production');
  const simulation = await post<{ id: string }>(
    page.request,
    `${root}/orders/${orderId}/payment-simulations`,
    { side: 'ARTISAN', payableId: finance.payables[0].id, dueAt: new Date().toISOString() },
  );
  await post(page.request, `${root}/payment-simulations/${simulation.id}/advance`, {
    next: 'SIMULATED_INITIATED',
  });
  await post(page.request, `${root}/payment-simulations/${simulation.id}/advance`, {
    next: 'SIMULATED_SETTLED',
  });
  for (const persona of ['buyer', 'artisan', 'coordinator']) {
    const restricted = await switchShared(persona);
    expect(restricted.scenario!.totals.payableMillimes).toBe('0');
    expect(restricted.scenario!.totals.simulatedMillimes).toBe('0');
  }
  await page.goto('/demo');
  await expect(page.getByTestId('demo-order-id')).toHaveText(orderId);
  await expect(
    page.getByText('Restricted to the internal finance perspective', { exact: true }),
  ).toHaveCount(2);
  state = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  expect(state.scenario!.totals.verifiedPaidMillimes).toBe('0');
  expect(state.scenario!.totals.publishedQr).toBe(1);
  await page.getByRole('button', { name: 'Reset Demo', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await get<DemoSessionView>(page.request, '/api/v1/demo/session')).scenario!.generation,
    )
    .toBe(2);
  const reset = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  expect(reset.scenario!.totals).toEqual(reset.scenario!.initialTotals);
  expect((await get<DemoSessionView>(other.request, '/api/v1/demo/session')).scenario!.id).toBe(
    second.scenario!.id,
  );
  await page.goto(publication.publicPath);
  await expect(page.getByText('This public record was revoked.')).toBeVisible();
  await other.close();
});

test('showroom is responsive, keyboard reachable and preserves scenario across persona navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Start Demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset Demo', exact: true })).toBeVisible();
  const initial = await get<DemoSessionView>(page.request, '/api/v1/demo/session');
  await page
    .getByRole('button', { name: 'Explore Synthetic authenticated artisan', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/commerce\/artisan$/);
  expect((await get<DemoSessionView>(page.request, '/api/v1/demo/session')).scenario!.id).toBe(
    initial.scenario!.id,
  );
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Reset Demo', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 50) })),
    ),
  ).toEqual([]);
});

test('E15-06 visitor shares structured feedback that persists through reset and stays private', async ({
  page,
}) => {
  test.setTimeout(180000);
  page.on('dialog', (dialog) => dialog.accept());

  // The browser visitor is its own isolated visitor: start its scenario through the real UI.
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Start Demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Share feedback', exact: true })).toBeVisible();
  const scenarioId = (await page.getByTestId('demo-scenario-id').textContent())?.trim() ?? '';
  expect(scenarioId.length).toBeGreaterThan(10);

  const panel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Share feedback', exact: true }) })
    .first();
  await expect(panel).toBeVisible();

  // A failed submission must not lose the draft text.
  await page.route('**/api/v1/demo/feedback', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'DEMO_UNAVAILABLE', message: 'Demo service unavailable.' }),
    }),
  );
  const draft = 'Synthetic draft that must survive a failed request.';
  await panel.getByLabel('Comment (optional)', { exact: true }).fill(draft);
  await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('Comment (optional)', { exact: true })).toHaveValue(draft);
  await page.unroute('**/api/v1/demo/feedback');

  // A real submission persists and is labelled as demonstration feedback.
  await panel.getByLabel('Category', { exact: true }).selectOption('USABILITY');
  await panel.getByLabel('Screen or story', { exact: true }).selectOption('PRESENTATION:workflow');
  const comment = 'The stage progress made the workflow easy to follow on mobile.';
  await panel.getByLabel('Comment (optional)', { exact: true }).fill(comment);
  await panel.getByRole('button', { name: 'Send private feedback', exact: true }).click();
  await expect(
    page.getByText(
      'Recorded as feedback about this synthetic demonstration. It is not customer satisfaction or published evidence.',
      { exact: true },
    ),
  ).toBeVisible();

  // It survives a reload and a showroom reset, and remains labelled and private.
  await page.reload();
  await page.getByText(/Your feedback for this scenario/).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Demo', exact: true }).click();
  await expect(page.getByText(/fresh scenario generation is ready/i)).toBeVisible();

  // page.request shares the browser visitor cookie, so it sees the same private submissions.
  const mineResponse = await page.request.get(`/api/v1/demo/feedback?scenarioId=${scenarioId}`);
  expect(mineResponse.ok(), await mineResponse.text()).toBeTruthy();
  const mine = (await mineResponse.json()) as {
    items: { id: string; comment: string; generation: number }[];
  };
  expect(mine.items.some((row) => row.comment === comment)).toBe(true);
  const stored = mine.items.find((row) => row.comment === comment)!;
  expect(stored.generation).toBe(1);

  const axe = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // Mobile layout keeps the form usable and the axe checks hold.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Share feedback', exact: true })).toBeVisible();
  const mobilePanel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Share feedback', exact: true }) })
    .first();
  await expect(mobilePanel.getByLabel('Category', { exact: true })).toBeVisible();
  await expect(
    mobilePanel.getByRole('button', { name: 'Send private feedback', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('E15-06 administrators moderate showroom feedback with attributable history', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  // Submit one visitor item through the real API.
  const started = await post<DemoSessionView>(request, '/api/v1/demo/start', {});
  const scenarioId = started.scenario!.id;
  const comment = 'Synthetic moderation target for the admin inbox.';
  const created = await post<{ id: string }>(request, '/api/v1/demo/feedback', {
    scenarioId,
    screenKey: 'SHOWROOM_STAGE_PROGRESS',
    category: 'IDEA',
    comment,
  });

  // A real administrator identity, promoted through the loopback control endpoint.
  const email = `demo-feedback-admin-${Date.now().toString(36)}@example.com`;
  const password = 'Synthetic-demo-admin-password-2026!';
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic demo reviewer', password },
      })
    ).status(),
  ).toBe(202);
  const token = await (
    await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`)
  ).json();
  expect(
    (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(token.token)}`)).status(),
  ).toBe(200);
  expect(
    (
      await request.post(
        `${process.env.E2E_CONTROL_URL}/promote?email=${encodeURIComponent(email)}`,
        {},
      )
    ).ok(),
  ).toBeTruthy();

  // Promotion revokes existing sessions, so sign in only after it succeeds.
  await page.goto('/auth/login?next=%2Fadmin%2Fdemo-feedback');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/auth\/login/);
  await page.goto('/admin/demo-feedback');

  await expect(page.getByRole('heading', { name: 'Showroom feedback', exact: true })).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  // Provenance is explicit and never claims a real participant view.
  await expect(
    page.getByText(/Visitor feedback about a synthetic demonstration/).first(),
  ).toBeVisible();
  await page
    .getByText(/Moderation history/)
    .first()
    .click();
  await expect(page.getByText(/Visitor \(anonymous\)/).first()).toBeVisible();

  // Close the item out with a stated reason.
  const target = page
    .locator('div')
    .filter({ has: page.getByText(comment, { exact: true }) })
    .last();
  await target.getByLabel('Next status', { exact: true }).selectOption('TRIAGED');
  await target
    .getByLabel('Reason (required to close out)', { exact: true })
    .fill('Reproduced on desktop');
  await target.getByRole('button', { name: 'Record moderation decision', exact: true }).click();
  await expect(page.getByText(/Moderation recorded/)).toBeVisible();

  const detailResponse = await page.request.get(`/api/v1/admin/demo-feedback/${created.id}`);
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
  const detail = (await detailResponse.json()) as {
    status: string;
    events: { kind: string; actorName: string }[];
  };
  expect(detail.status).toBe('TRIAGED');
  expect(detail.events.map((event) => event.kind)).toEqual(['SUBMITTED', 'STATUS_CHANGED']);
  expect(detail.events[1].actorName).toBe('Synthetic demo reviewer');

  const axe = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
