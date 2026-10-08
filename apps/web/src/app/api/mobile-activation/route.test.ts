import { afterEach, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { activationCode } from '../../../lib/mobile-activation';
import { POST } from './route';

const previous = {
  secret: process.env.MOBILE_ACTIVATION_SECRET,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

afterEach(() => {
  if (previous.secret === undefined) delete process.env.MOBILE_ACTIVATION_SECRET;
  else process.env.MOBILE_ACTIVATION_SECRET = previous.secret;
  if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
  if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
});

it('exchanges a current code for public configuration only', async () => {
  const secret = 'random-deployment-secret-longer-than-32-characters';
  process.env.MOBILE_ACTIVATION_SECRET = secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://customer.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_example';
  const request = (code: string) => new NextRequest('https://customer.example/api/mobile-activation', {
    method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' },
  });

  expect((await POST(request('000000000000'))).status).toBe(400);
  const response = await POST(request(activationCode(secret)));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    supabaseUrl: 'https://customer.supabase.co',
    supabaseAnonKey: 'sb_publishable_example',
  });

  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_secret_must_not_escape';
  expect((await POST(request(activationCode(secret)))).status).toBe(503);
});
