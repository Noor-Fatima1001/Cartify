import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRole, canAccessDashboard } from './authState.js';

test('normalizes role names to uppercase', () => {
  assert.equal(normalizeRole('vendor'), 'VENDOR');
  assert.equal(normalizeRole('CUSTOMER'), 'CUSTOMER');
  assert.equal(normalizeRole(undefined), '');
});

test('allows dashboard access for vendor and admin roles only', () => {
  assert.equal(canAccessDashboard('VENDOR'), true);
  assert.equal(canAccessDashboard('ADMIN'), true);
  assert.equal(canAccessDashboard('CUSTOMER'), false);
  assert.equal(canAccessDashboard(''), false);
});
