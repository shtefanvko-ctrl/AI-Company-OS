import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanyStore } from '../src/store.mjs';

test('company name and account type are mandatory', () => {
  const store = new CompanyStore();
  assert.throws(() => store.createOrganization({ userId: 'u1', name: '', accountType: 'shop' }));
  assert.throws(() => store.createOrganization({ userId: 'u1', name: 'Acme', accountType: '' }));
});

test('cross-tenant reads are denied', () => {
  const store = new CompanyStore();
  const a = store.createOrganization({ userId: 'u1', name: 'A', accountType: 'company' });
  store.createOrganization({ userId: 'u2', name: 'B', accountType: 'shop' });
  assert.throws(() => store.getOrganization({ organizationId: a.id, userId: 'u2' }), /forbidden/);
  assert.equal(store.getOrganization({ organizationId: a.id, userId: 'u1' }).name, 'A');
});

test('idempotency is scoped to organization', () => {
  const store = new CompanyStore();
  const a = store.createOrganization({ userId: 'u1', name: 'A', accountType: 'company' });
  const first = store.recordAction({ organizationId: a.id, userId: 'u1', actionType: 'CONTENT.PREPARE', idempotencyKey: 'k1' });
  const second = store.recordAction({ organizationId: a.id, userId: 'u1', actionType: 'CONTENT.PREPARE', idempotencyKey: 'k1' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.actionId, first.actionId);
});
