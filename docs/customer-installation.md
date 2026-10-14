# Instalasi barbershop baru

Setiap barbershop memakai **satu proyek Supabase dan satu deployment web Vercel miliknya sendiri**. Semua barbershop memakai **build APK yang sama**. APK mengambil koneksi Supabase dari web barbershop melalui aktivasi; tidak ada build, package ID, atau keystore APK per pelanggan.

Panduan ini hanya untuk **proyek Supabase baru yang kosong**. Skrip menolak proyek yang sudah memiliki pengguna dan tidak menghapus data. Jangan gunakan untuk memperbarui pelanggan yang sudah berjalan.

## 1. Siapkan proyek dan kredensial

- Siapkan Node.js 22+, Supabase CLI, dan akses operator ke proyek pelanggan (`supabase login`).
- Buat proyek Supabase baru. Catat project ref, publishable key (`sb_publishable_...`), dan secret key (`sb_secret_...`).
- Gunakan commit/rilis web yang memuat seluruh fitur dan migrasi kartu member, termasuk `supabase/migrations/20261013060518_member_cards.sql`. File lokal yang belum masuk Git tidak ikut checkout atau deploy pelanggan baru.
- Set `SUPABASE_SECRET_KEY` dari secret manager pada sesi PowerShell privat. Kunci ini hanya dipakai operator untuk provisioning; jangan masukkan ke Vercel, APK, atau repository.

## 2. Jalankan satu perintah provisioning

Dari root repository web:

```powershell
node scripts/provision-customer.mjs
```

Masukkan slug, project ref, publishable key, Owner, nama bisnis, dan cabang pertama. Skrip akan:

1. Memastikan proyek belum memiliki pengguna, lalu memasang seluruh migrasi dan seed referensi dengan `supabase db push --include-seed`.
2. Memastikan skema kartu member, bucket publik `member-card-assets` (PNG/JPEG/WebP, maksimal 2 MB), dan akses kartu publik tersedia sebelum membuat Owner.
3. Membuat Owner, identitas bisnis, dan cabang pertama.
4. Membuat `deployments/<slug>/web.env.local` yang berisi URL dan publishable key proyek pelanggan serta secret aktivasi APK khusus deployment web tersebut. Folder `deployments/` diabaikan Git.
5. Menampilkan password awal Owner sekali. Kirim secara aman dan minta Owner segera menggantinya.

Setelah selesai, hapus `SUPABASE_SECRET_KEY` dari sesi PowerShell (`Remove-Item Env:SUPABASE_SECRET_KEY`). Bila memakai key legacy, hapus juga `SUPABASE_SERVICE_ROLE_KEY`.

Jika skrip berhenti setelah migrasi atau pembuatan Owner, periksa proyek sebelum mencoba ulang. Auth user dan data bisnis dibuat melalui API terpisah dan tidak dapat dibatalkan sebagai satu transaksi.

## 3. Deploy web pelanggan di Vercel

- Buat deployment Vercel pelanggan dari **kode web yang sama**, dengan konfigurasi proyek web di `apps/web`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `MOBILE_ACTIVATION_SECRET` dari `deployments/<slug>/web.env.local` sebagai environment variables Production **sebelum build**. Jangan gunakan nilai dari pelanggan lain.
- Deploy web, lalu atur Supabase Auth Site URL dan redirect URL ke domain web pelanggan. Konfigurasikan SMTP sebelum memakai undangan atau reset password produksi.
- Secret aktivasi hanya milik server Vercel. Jangan beri awalan `NEXT_PUBLIC_` pada `MOBILE_ACTIVATION_SECRET` dan jangan simpan secret key Supabase di Vercel.

## 4. Hubungkan APK bersama

Owner login ke web pelanggan lalu buka **Pengaturan → Aktivasi APK**. Di APK bersama yang sudah terpasang, masukkan alamat web pelanggan dan kode 12 karakter yang ditampilkan. Setelah berhasil, login memakai akun Supabase pelanggan. APK menyimpan URL web serta koneksi publik Supabase pelanggan; tautan kartu member dari APK juga memakai domain web pelanggan tersebut.

Satu instalasi APK terhubung ke satu bisnis pada satu waktu. Untuk beralih bisnis, gunakan **Ganti instalasi web** pada layar login, kemudian aktivasi ulang. Tidak perlu membuat APK baru untuk pelanggan berikutnya.

## Pemeriksaan sebelum serah terima

1. Login Owner di web dan APK; pastikan bisnis dan cabang yang tampil milik pelanggan yang benar.
2. Buka pengaturan kartu member di web dan APK. Unggah logo/background, simpan pengaturan, terbitkan kartu, dan buka tautan kartu pada domain web pelanggan. Pastikan gambar berasal dari Storage proyek Supabase pelanggan tersebut.
3. Verifikasi alur inti pelanggan baru, antrean, booking, layanan, pembayaran, dan sesi kasir pada proyek pelanggan ini.
4. Cek dua pelanggan berbeda tidak berbagi project ref, URL web, data, atau secret aktivasi. **Package ID APK memang sama** karena aplikasinya satu build bersama.
5. Siapkan backup/restore database, monitoring, retensi, dan rotasi kunci. Uji restore sebelum transaksi riil.

Seed instalasi hanya `supabase/seed.sql` melalui CLI. Jangan jalankan `supabase/seed_operational_data.sql`. Uji migrasi lokal/PGlite tidak menggantikan uji coba pada Supabase Cloud baru, Vercel, dan perangkat Android fisik.
