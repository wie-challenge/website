import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {};',
      };
    }
    return nextLoad(url, context);
  },
});

const { ArtisanFinancePanel, FinancialPlanPanel, OrderEscrowPanel, PaymentsOperationsPanel } =
  await import('../src/components/payment-escrow-panel');

test('OrderEscrowPanel renders B2C and B2B escrow controls without internal allocation inputs', () => {
  const b2cHtml = renderToStaticMarkup(
    createElement(OrderEscrowPanel, {
      channel: 'B2C',
      orderId: 'order_b2c_1',
      canOperate: false,
    }),
  );
  assert.match(b2cHtml, /Escrow and checkout \(Sandbox only\)/);
  assert.match(b2cHtml, /Buyers pay NASJ centrally/);
  assert.doesNotMatch(b2cHtml, /Declare physical delivery/);

  const b2bHtml = renderToStaticMarkup(
    createElement(OrderEscrowPanel, {
      channel: 'B2B',
      orderId: 'order_b2b_1',
      canOperate: true,
    }),
  );
  assert.match(b2bHtml, /Escrow and checkout \(Sandbox only\)/);
  assert.match(b2bHtml, /Create payment obligation and escrow/);
});

test('FinancialPlanPanel, PaymentsOperationsPanel, and ArtisanFinancePanel render expected workspaces', () => {
  const planHtml = renderToStaticMarkup(
    createElement(FinancialPlanPanel, { orderId: 'order_b2b_1' }),
  );
  assert.match(planHtml, /Request financial plan and artisan allocations/);

  const opsHtml = renderToStaticMarkup(createElement(PaymentsOperationsPanel));
  assert.match(opsHtml, /Financial subledger trial balance/);
  assert.match(opsHtml, /Reconciliation/);
  assert.match(opsHtml, /Durable webhook inbox/);

  const artisanHtml = renderToStaticMarkup(
    createElement(ArtisanFinancePanel, { artisanProfileId: 'art_1' }),
  );
  assert.match(artisanHtml, /Your assigned compensation allocations/);
  assert.match(artisanHtml, /Recognized payables and simulated payouts/);
});
