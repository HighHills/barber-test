import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertMemberCardReady, validateCustomerSlug } from './provision-customer.mjs';

test('customer deployment slug accepts safe names only', () => {
  assert.doesNotThrow(() => validateCustomerSlug('barber-jaya'));
  assert.throws(() => validateCustomerSlug('../bad'), /Slug/);
  assert.throws(() => validateCustomerSlug('barber-'), /Slug/);
});

test('provisioning stops when member card storage or public access is incomplete', () => {
  const bucket = {
    id: 'member-card-assets', public: true, file_size_limit: 2097152,
    allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
  };
  assert.doesNotThrow(() => assertMemberCardReady(bucket, true));
  assert.throws(() => assertMemberCardReady({ ...bucket, public: false }, true), /belum siap/);
  assert.throws(() => assertMemberCardReady(bucket, false), /belum siap/);
});
