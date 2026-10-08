import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { customerPackage, mobileConfig } from './provision-customer.mjs';

test('customer APK identity is deterministic and distinct', () => {
  assert.equal(customerPackage('barber-jaya'), 'com.barbershop.barber_jaya');
  assert.notEqual(customerPackage('barber-jaya'), customerPackage('barber-makmur'));
  assert.match(mobileConfig('Barber Jaya', 'barber-jaya'), /com\.barbershop\.barber_jaya/);
  assert.throws(() => customerPackage('../bad'), /Slug/);
});
