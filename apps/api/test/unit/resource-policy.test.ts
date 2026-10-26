import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artisanOwnerPermissions,
  commerceCapacitiesFor,
  permissionsForMembership,
  platformAdminPermissions,
} from '@nasj/contracts';

const member = (type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION', roles: string[]) =>
  permissionsForMembership({
    isManager: false,
    status: 'ACTIVE',
    organization: { type, approvalStatus: 'APPROVED' },
    roles: roles.map((role) => ({ role })),
    permissionGrants: [],
  } as never);

test('commerce capacities come from permissions held in the matching organization type', () => {
  assert.deepEqual(commerceCapacitiesFor(member('BUYER_BUSINESS', ['BUYER']), 'BUYER_SIDE'), [
    'BUYER',
  ]);
  assert.deepEqual(commerceCapacitiesFor(member('BUYER_BUSINESS', ['BUYER']), 'OPERATOR_SIDE'), []);
  assert.deepEqual(
    commerceCapacitiesFor(member('INTERNAL', ['FINANCE_MANAGER']), 'OPERATOR_SIDE'),
    ['FINANCE_MANAGER'],
  );
  assert.deepEqual(
    commerceCapacitiesFor(member('INTERNAL', ['QUALITY_INSPECTOR']), 'OPERATOR_SIDE'),
    ['QUALITY_INSPECTOR'],
  );
  assert.deepEqual(
    commerceCapacitiesFor(
      member('INTERNAL', ['PRODUCTION_MANAGER', 'INVENTORY_LOGISTICS_COORDINATOR']),
      'OPERATOR_SIDE',
    ).sort(),
    ['INVENTORY_LOGISTICS_COORDINATOR', 'PRODUCTION_MANAGER'],
  );
});

test('a role in the wrong organization type, or an association coordinator, holds no commerce capacity', () => {
  assert.deepEqual(
    commerceCapacitiesFor(member('BUYER_BUSINESS', ['FINANCE_MANAGER']), 'OPERATOR_SIDE'),
    [],
  );
  assert.deepEqual(commerceCapacitiesFor(member('INTERNAL', ['BUYER']), 'BUYER_SIDE'), []);
  assert.deepEqual(
    commerceCapacitiesFor(member('ASSOCIATION', ['ASSOCIATION_COORDINATOR']), 'OPERATOR_SIDE'),
    [],
  );
});

test('artisan owner actions and platform admin actions stay separate', () => {
  assert.ok(artisanOwnerPermissions.includes('artisan.payment.read'));
  assert.ok(artisanOwnerPermissions.includes('artisan.offer.decide'));
  for (const action of platformAdminPermissions)
    assert.equal(artisanOwnerPermissions.includes(action), false);
  for (const action of [
    'finance.payment.manage',
    'artisan.profile.read',
    'production.manage',
  ] as const)
    assert.equal(platformAdminPermissions.includes(action), false);
});