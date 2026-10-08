# Instalasi pelanggan baru (1 bisnis = 1 proyek Supabase + 1 APK)

Panduan ini untuk **proyek Supabase baru yang kosong**. Jangan jalankan pada proyek pelanggan yang sudah berisi pengguna atau transaksi. Skrip tidak menghapus data dan menolak proyek yang sudah memiliki pengguna.

## Prasyarat operator

- Node.js 20+, pnpm, Supabase CLI, dan akses ke proyek Supabase pelanggan (`supabase login`).
- Buat satu proyek Supabase **terpisah** untuk pelanggan ini. Catat project ref, publishable key (`sb_publishable_...`), dan secret key (`sb_secret_...`) dari dashboard pelanggan.
- Siapkan checkout web ini dan checkout Expo `barbershopapp_mobile` yang bersih untuk pelanggan tersebut. Jangan memakai `.env`/`eas.json` dari pelanggan lain.
- Di PowerShell operator, set `SUPABASE_SECRET_KEY` melalui secret manager atau sesi terminal privat. Kunci ini hanya dibaca saat provisioning. Jangan taruh di `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, APK, atau repository.

## Satu perintah provisioning

Dari root repository web:

```powershell
node scripts/provision-customer.mjs
```

Masukkan slug pelanggan, project ref, publishable key, email/nama Owner, nama bisnis, serta kode/nama cabang pertama. Skrip akan:

1. Memastikan proyek tidak memiliki pengguna, lalu menjalankan `supabase db push --include-seed` ke project ref tersebut.
2. Memverifikasi peran OWNER tersedia dan belum ada bisnis/cabang.
3. Membuat akun Owner, profil, peran global Owner, identitas bisnis, dan cabang pertama.
4. Membuat `deployments/<slug>/web.env.local`, `mobile.app.config.js`, dan `mobile.eas.json`. Folder ini diabaikan Git.
5. Menampilkan password awal Owner **sekali**. Kirim lewat kanal aman dan minta Owner segera menggantinya.

Setelah provisioning, hapus `SUPABASE_SECRET_KEY` dari sesi PowerShell (`Remove-Item Env:SUPABASE_SECRET_KEY`) sebelum menjalankan build. Jika memakai key legacy, hapus juga `SUPABASE_SERVICE_ROLE_KEY`.

Jika perintah terhenti setelah migrasi, **jangan** menjalankan ulang tanpa memeriksa proyek. Pembuatan Auth user dan data bisnis tidak dalam satu transaksi lintas API; bagian yang sudah dibuat tidak dihapus otomatis.

## Deploy web dan bangun APK

- Pasang `web.env.local` sebagai `apps/web/.env.local` pada checkout/deployment pelanggan. Di Vercel, set kedua `NEXT_PUBLIC_*` dan `MOBILE_ACTIVATION_SECRET` dari file tersebut pada environment produksi, lalu build ulang web. Secret aktivasi hanya untuk server; jangan pakai awalan `NEXT_PUBLIC_`.
- Untuk deploy web tanpa file hasil provisioning, buat `MOBILE_ACTIVATION_SECRET` acak dengan `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, lalu simpan sebagai environment variable server di Vercel. Jangan memakai nilai contoh dari `.env.example`.
- Pasang `mobile.app.config.js` sebagai `app.config.js` dan `mobile.eas.json` sebagai `eas.json` di root Expo pelanggan. Jangan sertakan `EXPO_PUBLIC_SUPABASE_*` pada build baru; bila `.env` lama masih ada, hapus kedua nilai tersebut dari build baru agar APK menampilkan aktivasi pertama. Periksa `npx expo config --type public`: nama aplikasi dan `android.package` harus milik pelanggan ini.
- Untuk APK yang dapat dipasang langsung: jalankan `eas build --platform android --profile release-apk` dari root Expo pelanggan. Untuk Google Play: `eas build --platform android --profile store-aab` (menghasilkan AAB, bukan APK).
- Simpan keystore penandatanganan **per pelanggan**; jangan mengganti package ID atau keystore pada update pelanggan yang sama. APK pelanggan lain memakai package ID berbeda.
- Atur Supabase Auth Site URL dan redirect URL ke domain web pelanggan. Konfigurasikan SMTP sebelum mengandalkan undangan/reset password di produksi.
- Setelah web ter-deploy, Owner login ke web, buka **Pengaturan → Aktivasi APK**, lalu masukkan alamat web dan kode 12 karakter yang ditampilkan ke APK. Kode berlaku hingga batas waktu yang tertera (maksimal 10 menit). Setelah terhubung, login APK dengan akun Supabase pelanggan. Untuk memasangkan ulang, pilih **Ganti instalasi web** pada layar login APK.

`NEXT_PUBLIC_SUPABASE_*` dan konfigurasi yang diterima APK adalah kunci publik; akses data tetap dibatasi oleh peran dan RLS. `MOBILE_ACTIVATION_SECRET` tidak pernah dikirim ke APK. Kode aktivasi bukan izin akses database atau pengganti login. APK yang diperbarui akan meminta aktivasi sekali jika belum pernah dipasangkan, termasuk instalasi uji lama yang sebelumnya hanya memakai `EXPO_PUBLIC_SUPABASE_*`.

## Pemeriksaan sebelum serah terima

1. Login Owner di web **dan** APK; pastikan keduanya menampilkan bisnis dan cabang pelanggan ini.
2. Verifikasi pelanggan baru, antrean, booking, layanan, pembayaran, dan sesi kasir pada proyek pelanggan ini, bukan proyek uji internal.
3. Cek dua pelanggan berbeda tidak berbagi project ref, URL, APK package ID, atau data.
4. Siapkan backup/restore database, monitoring, kebijakan retensi, dan prosedur rotasi kunci. Uji restore sekali sebelum transaksi riil.
5. Jangan jalankan `supabase/seed_operational_data.sql` untuk instalasi pelanggan. Seed produksi hanya `supabase/seed.sql` melalui CLI.

Uji `clean-migration-install` menguji PostgreSQL lokal/PGlite, **belum** menggantikan smoke test pada Supabase Cloud baru dan perangkat Android fisik.
Suite aturan bisnis penuh juga harus kembali hijau sebelum rilis; beberapa tes lama masih mengasumsikan write langsung ke tabel yang sudah dibatasi oleh RPC dan beberapa hook timeout saat berjalan paralel.

Rujukan: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase Data API grants](https://supabase.com/docs/guides/api/securing-your-api), [Expo app config](https://docs.expo.dev/workflow/configuration/), [EAS APK](https://docs.expo.dev/build-reference/apk/).
