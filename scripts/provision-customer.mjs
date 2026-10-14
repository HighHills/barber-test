import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

export function validateCustomerSlug(slug) {
  if (!/^[a-z][a-z0-9-]{2,30}$/.test(slug) || slug.endsWith('-')) {
    throw new Error('Slug harus 3–31 karakter: huruf kecil, angka, tanda -, diawali huruf.');
  }
}

export function assertMemberCardReady(bucket, publicCardAccessible) {
  if (bucket.id !== 'member-card-assets' || bucket.public !== true || bucket.file_size_limit !== 2097152 ||
      !['image/png', 'image/jpeg', 'image/webp'].every((mime) => bucket.allowed_mime_types?.includes(mime)) ||
      !publicCardAccessible) {
    throw new Error('Kartu member atau Supabase Storage belum siap. Tidak membuat Owner atau data bisnis.');
  }
}

async function main() {
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('Set SUPABASE_SECRET_KEY di environment operator; jangan simpan di aplikasi.');
  const rl = createInterface({ input: stdin, output: stdout });
  let answers;
  try {
    answers = {
      slug: (await rl.question('Slug pelanggan (contoh: barber-jaya): ')).trim(),
      ref: (await rl.question('Supabase project ref pelanggan: ')).trim(),
      publicKey: (await rl.question('Supabase publishable/anon key: ')).trim(),
      ownerEmail: (await rl.question('Email Owner: ')).trim().toLowerCase(),
      ownerName: (await rl.question('Nama Owner: ')).trim(),
      businessName: (await rl.question('Nama bisnis: ')).trim(),
      outletCode: (await rl.question('Kode cabang pertama (contoh: OUT-01): ')).trim().toUpperCase(),
      outletName: (await rl.question('Nama cabang pertama: ')).trim(),
    };
  } finally {
    rl.close();
  }
  const { slug, ref, publicKey, ownerEmail, ownerName, businessName, outletCode, outletName } = answers;
  validateCustomerSlug(slug);
  if (!/^[a-z0-9]{10,40}$/.test(ref)) throw new Error('Project ref Supabase tidak valid.');
  if (!publicKey || publicKey === serviceKey || publicKey.startsWith('sb_secret_')) throw new Error('Kunci publik kosong atau merupakan secret key.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error('Email Owner tidak valid.');
  if ([ownerName, businessName, outletCode, outletName].some((value) => !value)) throw new Error('Semua nama dan kode cabang wajib diisi.');
  if (ownerName.length > 150 || businessName.length > 255 || outletName.length > 255 || !/^[A-Z0-9_-]{3,20}$/.test(outletCode)) {
    throw new Error('Nama atau kode cabang terlalu panjang/tidak valid. Kode: 3–20 huruf besar, angka, - atau _.');
  }
  const outputDir = resolve('deployments', slug);
  if (existsSync(outputDir)) throw new Error(`Folder ${outputDir} sudah ada; instalasi tidak akan menimpanya.`);
  if (!existsSync(resolve('supabase/migrations/20261013060518_member_cards.sql'))) {
    throw new Error('Migrasi kartu member tidak ada di checkout ini. Gunakan rilis web yang lengkap.');
  }

  const url = `https://${ref}.supabase.co`;
  const publicKeyCheck = await fetch(url + '/auth/v1/settings', { headers: { apikey: publicKey } });
  if (!publicKeyCheck.ok) throw new Error('Publishable/anon key tidak cocok dengan proyek Supabase yang dipilih.');
  async function request(path, method = 'GET', body) {
    const response = await fetch(url + path, {
      method,
      headers: {
        apikey: serviceKey,
        ...(!serviceKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${serviceKey}` } : {}),
        ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]} gagal (${response.status}): ${result?.message || result?.error || 'periksa project dan izin'}`);
    return result;
  }

  // Refuse existing users before touching schema; this command is only for a fresh tenant.
  const existing = await request('/auth/v1/admin/users?page=1&per_page=1');
  if (existing?.users?.length) throw new Error('Proyek sudah memiliki user. Gunakan proyek Supabase kosong untuk pelanggan baru.');

  stdout.write('\nMemasang migrasi dan data referensi di proyek pelanggan...\n');
  const pushed = spawnSync('supabase', ['db', 'push', '--project-ref', ref, '--include-seed', '--yes'], {
    cwd: resolve('.'), stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (pushed.error || pushed.status !== 0) throw new Error(`Migrasi gagal. ${pushed.error?.message || 'Periksa output CLI di atas.'}`);

  const roles = await request('/rest/v1/roles?select=id&code=eq.OWNER');
  const settings = await request('/rest/v1/business_settings?select=id,member_card_name,member_card_lifetime,member_card_validity_months&limit=1');
  const outlets = await request('/rest/v1/outlets?select=id&limit=1');
  const bucket = await request('/storage/v1/bucket/member-card-assets');
  const publicCardCheck = await fetch(url + '/rest/v1/rpc/get_public_member_card', {
    method: 'POST',
    headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: '00000000-0000-4000-8000-000000000000' }),
  });
  if (roles.length !== 1 || settings.length || outlets.length) {
    throw new Error('Kontrak seed/proyek kosong tidak sesuai. Tidak membuat Owner atau data bisnis.');
  }
  assertMemberCardReady(bucket, publicCardCheck.ok);

  const password = randomBytes(24).toString('base64url');
  try {
    const created = await request('/auth/v1/admin/users', 'POST', {
      email: ownerEmail, password, email_confirm: true,
    });
    const authUserId = created?.id || created?.user?.id;
    if (!authUserId) throw new Error('Auth Admin tidak mengembalikan user ID.');
    const profiles = await request('/rest/v1/profiles?select=id', 'POST', {
      auth_user_id: authUserId, display_name: ownerName,
    });
    const profileId = profiles?.[0]?.id;
    if (!profileId) throw new Error('Profil Owner tidak terbentuk.');
    await request('/rest/v1/user_roles', 'POST', {
      user_id: profileId, role_id: roles[0].id, outlet_id: null,
    });
    await request('/rest/v1/business_settings', 'POST', { business_name: businessName });
    await request('/rest/v1/outlets', 'POST', { code: outletCode, name: outletName });
  } catch (error) {
    throw new Error(`Provisioning terhenti setelah migrasi; periksa keadaan proyek sebelum mencoba lagi. ${error.message}`);
  }

  mkdirSync(outputDir, { recursive: true });
  const publicEnv = `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${publicKey}\nMOBILE_ACTIVATION_SECRET=${randomBytes(32).toString('hex')}\n`;
  writeFileSync(resolve(outputDir, 'web.env.local'), publicEnv, { flag: 'wx', mode: 0o600 });
  stdout.write(`\nSelesai. Konfigurasi Vercel: ${resolve(outputDir, 'web.env.local')}\nOwner: ${ownerEmail}\nPassword sementara (tampilkan sekali): ${password}\nGanti password setelah login pertama. Deploy web, lalu hubungkan APK bersama melalui Pengaturan → Aktivasi APK.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
