import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
const password = 'Synthetic-Batch12-browser-password-2026!';
async function register(request: APIRequestContext, email: string) {
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        headers: { Origin: origin },
        data: { email, name: 'Synthetic Batch12 reviewer', password },
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
async function login(page: Page, email: string) {
  await page.goto('/auth/login?next=%2Foperator%2Fsales');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/operator\/sales$/);
}
async function command(page: Page, path: string, data: unknown) {
  const me = await (await page.request.get('/api/v1/me')).json();
  const r = await page.request.post(`/api/v1/${path}`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': me.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data,
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
for(const width of [390,1280])test(`Independent commercial, cash, export and retention boundaries ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:950});const suffix='b12audit'+width+Date.now().toString(36);const email=`production-operator-${suffix}@example.com`;
 for(const e of [email,`production-artisan-${suffix}@example.com`,`production-coordinator-${suffix}@example.com`])await register(request,e);
 const seed=await request.post(`${process.env.E2E_CONTROL_URL}/production-fixture?suffix=${suffix}`);expect(seed.ok(),await seed.text()).toBeTruthy();const fixture=await seed.json();await login(page,email);
 await expect(page.getByText('No prospects in your authorized sales organizations.')).toBeVisible();
 await page.route('**/api/v1/sales',route=>route.abort());await page.reload();await expect(page.getByRole('main').getByRole('alert').filter({hasText:'temporarily unavailable'})).toBeVisible();await page.unroute('**/api/v1/sales');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('No prospects in your authorized sales organizations.')).toBeVisible();
 await page.getByText('Add prospect organization',{exact:true}).click();const form=page.locator('form').filter({has:page.getByRole('button',{name:'Create prospect',exact:true})});
 await form.getByLabel('Existing assigned buyer reference (instead of new name)',{exact:true}).fill(fixture.buyerOrganizationId);
 for(const [label,value] of [['Commercial segment','Independent hospitality'],['Buyer needs','Independent synthetic buyer needs'],['Qualification notes','Qualification without agreement'],['Next action','Independent follow-up'],['Permission evidence','Independent contact permission'],['Change reason','Independent discovery']])await form.getByLabel(label,{exact:true}).fill(value);
 await form.getByLabel('Contact permission review date',{exact:true}).fill('2027-12-01T12:00');await form.getByRole('button',{name:'Create prospect',exact:true}).click();await expect(page.getByRole('heading',{name:`Production buyer ${suffix}`,exact:true})).toBeVisible();
 await page.getByText('Update qualification and contact permission',{exact:true}).click();const update=page.locator('form').filter({has:page.getByRole('button',{name:'Save qualification',exact:true})});await update.getByLabel('Contact permission basis',{exact:true}).selectOption('DO_NOT_CONTACT');await update.getByLabel('Change reason',{exact:true}).fill('Independent contact withdrawal');await update.getByRole('button',{name:'Save qualification',exact:true}).click();await expect(page.getByText('Contact: Unavailable: permission expired or contact declined',{exact:true})).toBeVisible();
 const sales=await(await page.request.get('/api/v1/sales')).json();expect(sales.prospects[0].organization.contactEmail).toBeNull();expect(sales.prospects[0].revisions).toHaveLength(2);
 await page.goto('/operator/finance');await page.getByLabel('Commercial order reference',{exact:true}).fill(fixture.orderId);await page.getByRole('button',{name:'Open order finances',exact:true}).click();await expect(page.getByRole('heading',{name:'Contribution and working capital',exact:true})).toBeVisible();
 await page.getByText('Review funding before a sales-linked contract',{exact:true}).click();
 const funding=page.locator('form').filter({has:page.getByRole('button',{name:'Record RFQ finance review',exact:true})});
 await funding.getByLabel('RFQ to review',{exact:true}).fill(fixture.rfqId);await funding.getByLabel('Exact costed quote reference',{exact:true}).fill(fixture.quoteId);await funding.getByLabel('Funding plan evidence',{exact:true}).fill('Independent browser unfunded hold');await funding.getByLabel('Finance review reason',{exact:true}).fill('Independent funding controls review');
 const fundingResponse=page.waitForResponse(r=>r.url().endsWith(`/api/v1/finance/rfqs/${fixture.rfqId}/review`)&&r.request().method()==='POST');await funding.getByRole('button',{name:'Record RFQ finance review',exact:true}).click();const fundingResult=await fundingResponse;expect(fundingResult.status()).toBe(201);const fundingBody=await fundingResult.json();expect(fundingBody.id).toBeTruthy();expect(fundingBody.decision).toBe('HOLD');expect(fundingBody.verifiedFunds).toBe(false);
 await page.getByText('Review projected cash requirements',{exact:true}).click();const cash=page.locator('form').filter({has:page.getByRole('button',{name:'Save cash review',exact:true})});await cash.getByLabel('Cash source reference 1',{exact:true}).fill('Unknown material invoice');await cash.getByLabel('Cash amount TND 1',{exact:true}).fill('12.345');await cash.getByLabel('Cash assumption evidence 1',{exact:true}).fill('Independent projected evidence');await cash.getByLabel('Variance explanation',{exact:true}).fill('No complete actual evidence');await cash.getByLabel('Cash review reason',{exact:true}).fill('Independent incomplete date review');await cash.getByRole('button',{name:'Save cash review',exact:true}).click();await expect(page.getByText('Minimum modeled cash gap: Unavailable; review missing or dated inputs incomplete.',{exact:true})).toBeVisible();
 const model=await(await page.request.get(`/api/v1/finance/orders/${fixture.orderId}/analysis`)).json();expect(model.cashModel.minimumModeledGapTnd).toBeNull();expect(model.cashModel.incomplete).toBeTruthy();
 await page.getByLabel('Financial period from',{exact:true}).fill('2026-10-01T00:00');await page.getByLabel('Financial period to (exclusive)',{exact:true}).fill('2026-11-01T00:00');await page.getByRole('button',{name:'Set financial reporting period',exact:true}).click();await page.getByRole('button',{name:'Prepare accounting CSV',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download accounting CSV',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe(`accounting-${fixture.orderId}.csv`);const {readFile}=await import('node:fs/promises');const csv=await readFile((await download.path())!,'utf8');expect(csv).toContain('ACCEPTED_QUOTE_REFERENCE');expect(csv).not.toMatch(/contactEmail|beneficiary|VERIFIED_SETTLED/);
 await page.goto('/admin/retention');await expect(page.getByRole('heading',{name:'Access denied',exact:true})).toBeVisible();
 const promote=await request.post(`${process.env.E2E_CONTROL_URL}/promote?email=${encodeURIComponent(email)}`);expect(promote.ok()).toBeTruthy();await login(page,email);await page.goto('/admin/retention');await expect(page.getByRole('heading',{name:'Retention and purpose governance',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'FINANCIAL_RECORDS',exact:true})).toBeVisible();await page.getByLabel('Review purpose',{exact:true}).fill('Independent retention purpose review');await page.getByLabel('Review findings and unresolved decisions',{exact:true}).fill('Durations require qualified legal policy review');await page.getByRole('button',{name:'Record operational inventory review',exact:true}).click();await expect(page.getByText(`${width===390?1:2} operational reviews recorded. Legal policy approval remains pending.`,{exact:true})).toBeVisible();
 const inventory=await(await page.request.get('/api/v1/governance/retention')).json();expect(inventory.purgeEnabled).toBeFalsy();expect(inventory.reviewStatus).toBe('PENDING_QUALIFIED_POLICY_REVIEW');expect(inventory.inventory).toHaveLength(9);
 await page.getByLabel('Review purpose',{exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByLabel('Review findings and unresolved decisions',{exact:true})).toBeFocused();expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
