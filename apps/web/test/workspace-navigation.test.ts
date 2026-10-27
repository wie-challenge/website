import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IdentityContext, OperationalPersona } from '@nasj/contracts';
import { workspaceNavigation, workspaceRoleLabel } from '../src/lib/app-navigation';
const legacy = { buyer: false, artisan: false, operator: false, admin: false };
function context(persona?: OperationalPersona): IdentityContext {
  return {
    personas: persona ? [persona] : [],
    organizations: [],
    coordinatorOrganizationId: null,
    linkedArtisanProfileId: null,
    landingPath: '/dashboard',
    realPayoutsEnabled: false,
    independentContactPath: '/participant-support',
  };
}
function routes(persona?: OperationalPersona) {
  return workspaceNavigation(context(persona), legacy).flatMap((s) => s.items.map((i) => i.href));
}
test('admin navigation exposes people and governance requests without granting commercial or artisan work', () => {
  const links = routes('PLATFORM_ADMIN');
  for (const path of [
    '/admin/users',
    '/admin/organizations',
    '/admin/operators',
    '/admin/coordinators',
    '/admin/privacy-requests',
    '/admin/participant-concerns',
  ])
    assert(links.includes(path));
  for (const path of ['/procurement', '/association/artisans', '/commerce/operator'])
    assert(!links.includes(path));
});
test('operator navigation provides assigned-account coordination rather than user administration', () => {
  const links = routes('NASJ_OPERATOR');
  for (const path of [
    '/operator',
    '/operator/activity',
    '/operator/inventory',
    '/operator/finance',
    '/procurement',
  ])
    assert(links.includes(path));
  assert(!links.some((p) => p.startsWith('/admin') || p.startsWith('/association')));
});
test('buyer and association navigation keep purchasing and participant management separate', () => {
  const buyer = routes('BUYER_REPRESENTATIVE'),
    coordinator = routes('ASSOCIATION_COORDINATOR');
  assert(buyer.includes('/procurement/documents'));
  assert(buyer.includes('/directory'));
  assert(!buyer.includes('/association/artisans'));
  assert(coordinator.includes('/association/artisans'));
  assert(coordinator.includes('/directory'));
  assert(coordinator.includes('/association/materials'));
  assert(!buyer.includes('/operator/finance') && !buyer.includes('/operator/inventory'));
  assert(coordinator.includes('/procurement/discussions'));
  assert(!coordinator.includes('/procurement') && !coordinator.includes('/procurement/documents'));
});
test('missing identity context never invents operational access from legacy capability flags', () => {
  const sections = workspaceNavigation(null, { ...legacy, admin: true, buyer: true });
  assert(
    !sections
      .flatMap((s) => s.items)
      .some((i) => i.href.startsWith('/admin') || i.href === '/procurement'),
  );
  assert.equal(workspaceRoleLabel(context('ASSOCIATION_COORDINATOR')), 'Association coordinator');
  assert.equal(workspaceRoleLabel(null), 'Your account');
});
