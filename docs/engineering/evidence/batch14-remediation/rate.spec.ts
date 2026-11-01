import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('pending original recovery honors actual 8/300 rate policy on mobile and desktop', async ({ page }) => {
  await page.setViewportSize({width:390,height:900});
  await page.goto('/demo');
  const initialRead=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/demo/feedback?'));
  await page.getByRole('button',{name:'Start Demo',exact:true}).click();
  expect((await initialRead).status()).toBe(200); // 1: panel list read (the existing LOW behavior).
  const panel=page.getByRole('region',{name:'Share feedback',exact:true});
  const comment=panel.getByLabel('Comment (optional)',{exact:true});
  const attempts:{key:string,payload:unknown}[]=[];
  await page.route('**/api/v1/demo/feedback',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    attempts.push({key:route.request().headers()['idempotency-key'],payload:route.request().postDataJSON()});
    if(attempts.length===1){
      const response=await route.fetch();expect(response.status()).toBe(201); // 2: committed operation.
      return route.abort('failed');
    }
    return route.continue();
  });
  await comment.fill('Rate-bound original feedback');
  await panel.getByRole('button',{name:'Send private feedback',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('unavailable');
  // Six reads consume the remaining allowance without changing product rate policies.
  for(let n=0;n<6;n++)expect((await page.request.get('/api/v1/demo/feedback')).status()).toBe(200);
  await comment.fill('Edited draft retained during throttle');
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    const denied=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/demo/feedback'));
    await panel.getByRole('button',{name:'Retry original feedback'}).click();
    const response=await denied;expect(response.status()).toBe(429);expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
    await expect(panel.getByRole('alert')).toContainText('Too many requests');
    await expect(comment).toHaveValue('Edited draft retained during throttle');
    await expect(panel.getByRole('region',{name:'Accepted feedback'})).toHaveCount(0);
    expect(attempts.at(-1)).toEqual(attempts[0]);
    expect((await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({path:`docs/engineering/evidence/batch14-remediation/rate-${width}.png`,fullPage:true});
  }
});
