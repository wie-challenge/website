import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-feedback-browser-password-2026!';

async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic feedback persona', password },
      })
    ).status(),
  ).toBe(202);
  const { token } = await (
    await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`)
  ).json();
  expect(
    (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status(),
  ).toBe(200);
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}

for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
 test(`Batch2 operator gap attribution at ${viewport.width}`,async({page,request})=>{
 test.setTimeout(180000);page.on('dialog',d=>d.accept());await page.setViewportSize(viewport);
    const suffix = `gap${Date.now().toString(36)}`;
    const buyerEmail = `feedback-buyer-${suffix}@example.com`;
    const operatorEmail = `production-operator-${suffix}@example.com`;
    const artisanEmail = `production-artisan-${suffix}@example.com`;
    const coordinatorEmail = `production-coordinator-${suffix}@example.com`;
    await register(request, operatorEmail);
    await register(request, artisanEmail);
    await register(request, coordinatorEmail);
    await register(request, buyerEmail);
    const seeded = await request.post(
      `${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`,
    );
    expect(seeded.ok(), await seeded.text()).toBeTruthy();
    const feedbackSeed = await request.post(
      `${process.env.E2E_CONTROL_URL}/feedback-fixture?suffix=${suffix}&buyer=${encodeURIComponent(buyerEmail)}`,
    );
    expect(feedbackSeed.ok(), await feedbackSeed.text()).toBeTruthy();
    const feedback = (await feedbackSeed.json()) as { rfqId: string; orderId: string };


 await login(page,buyerEmail,'/procurement');await page.goto(`/procurement/${feedback.rfqId}`);await page.getByRole('tab',{name:'Delivery',exact:true}).click();
 const receipt=page.getByRole('article',{name:'Shipment DELIVERY_REPORTED'});await receipt.getByLabel('Pieces received',{exact:true}).fill('8');await receipt.getByLabel('Pieces accepted',{exact:true}).fill('8');await receipt.getByLabel('Pieces missing',{exact:true}).fill('0');await receipt.getByLabel('Pieces damaged',{exact:true}).fill('0');await receipt.getByRole('button',{name:'Confirm buyer receipt',exact:true}).click();
 const card=page.getByRole('article',{name:'Shipment DISCREPANCY'});await expect(card).toContainText('2 not reported delivered by the operator');await expect(card).toContainText('0 declared missing by the buyer');
 await expect(page.getByRole('region',{name:'Your delivery feedback'}).getByLabel('Confirmed receipt')).toContainText('2 not reported delivered by the operator; 0 declared missing by the buyer');
 await page.screenshot({path:`/home/ashenix/Projects/wie-challenge/website/docs/engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/captures/operator-gap-${viewport.width}.png`,fullPage:true});
 });
}
test('provenance remains visible in presentation and captured print export',async({page})=>{
 await page.goto('/presentation');await page.getByRole('combobox',{name:'Go to scene'}).selectOption('7');await expect(page.locator('[data-claim-id="presentation.transparency"]')).toContainText('Synthetic');
 await page.screenshot({path:"/home/ashenix/Projects/wie-challenge/website/docs/engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/captures/presentation-label.png",fullPage:true});await page.emulateMedia({media:'print'});await expect(page.locator('[data-claim-id="presentation.transparency"]')).toBeVisible();await page.screenshot({path:"/home/ashenix/Projects/wie-challenge/website/docs/engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/captures/presentation-print-labels.png",fullPage:true});
});
