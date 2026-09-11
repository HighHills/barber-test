# Barbershop Operating System — Design System & Visual Direction (DESIGN.md)

> **SOURCE OF TRUTH**: Dokumen ini adalah acuan visual, hierarki layout, tipografi, dan gaya salinan (copywriting) resmi untuk seluruh ekosistem Barbershop Operating System. Digunakan bersamaan dengan filter Anti-Slop (`GEMINI.md` & `.gemini/skills/`).

---

## 1. Product Identity

- **Name**: Barbershop Operating System
- **Product Type**: Operational Business Software terpadu untuk industri Barbershop & Grooming Salon Multi-Cabang.
- **Primary Users**:
  - Owner (Pemilik Bisnis)
  - Administrator (Manajer Operasional)
  - Cashier (Kasir Cabang)
  - Barber (Kapster / Pemotong Rambut)
  - Operational Staff (Staff Gudang & Inventori)

---

## 2. Core Personality

- **Professional**: Rapi, presisi, dan dapat diandalkan untuk data transaksi bernilai tinggi.
- **Operational**: Didesain untuk alur kerja kerja nyata di kasir dan meja manajerial.
- **Confident**: Kontras warna tegas, batas elemen jelas, tidak ragu-ragu.
- **Practical & Fast**: Minim klik, responsif seketika, bebas distraksi estetika kosong.
- **Compact & High Information Density**: Memaksimalkan ruang kerja produktif tanpa membuat sesak.
- **Modern & Human**: Menggunakan bahasa operasional yang ramah dan lugas bagi staf lapangan di Indonesia.

---

## 3. The Product Experience: "One Cohesive System"

Pengguna harus selalu merasakan bahwa mereka berada di dalam **aplikasi yang sama**:
- Berpindah dari **POS Kasir** (`/`) ke **Settings** (`/settings`),
- Berpindah dari **Inventori** (`/inventory`) ke **Biaya** (`/expenses`),
- Berpindah dari **Keuangan** (`/accounting`) ke **Sub-Akun** (`/subaccounts`).

Tidak ada halaman yang boleh tampil seperti "portal admin terpisah", "website promosi", atau template SaaS generik.

---

## 4. Visual Direction & Color Palette

### 4.1. Application Shell Identity
- **Dark Navy Application Shell**:
  - Background Shell: `bg-slate-900` (`#0f172a`)
  - Border Separators: `border-slate-800` (`#1e293b`)
  - Elevated Surfaces / Menus: `bg-slate-800` (`#1e293b`) dengan border `border-slate-700` (`#334155`)
  - Text Primary: `text-white` (`#ffffff`)
  - Text Muted: `text-slate-300` / `text-slate-400` (`#94a3b8`)

### 4.2. Intentional Accent: Amber / Gold
Aksen hangat digunakan secara spesifik dan fungsional untuk:
- **Primary Action Buttons**: `bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-sm shadow-amber-500/20`
- **Active Navigation Indicator**: `bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold`
- **Focus States**: `focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50`
- **Important Operational Alerts**: State laci kasir, peringatan cabang, badge kupon.

### 4.3. Operational Content Surfaces
- **Workspace Canvas**: `bg-slate-950` atau `bg-slate-900` untuk elevated application shell; `bg-slate-100` untuk POS desk operational view.
- **Cards & Containers**:
  - Background: `bg-slate-900/90` atau `bg-slate-900`
  - Border: `border border-slate-800`
  - Corner Radius: Konsisten `rounded-2xl` (container besar) atau `rounded-xl` (elemen interaktif/form)

---

## 5. Layout Character & Spacing Scale

- **Information Density**: Cukup tinggi untuk meminimalkan scrolling yang tidak perlu saat bekerja.
- **Whitespace Purpose**: Spacing semata-mata untuk membedakan hierarki dan pengelompokan informasi logis, bukan whitespace dekoratif yang boros.
- **Card Semantics**: Card HANYA digunakan untuk mengelompokkan data yang secara semantik saling terkait (misal: "Identitas Bisnis", "Aturan Pajak", "Daftar Cabang").
- **Grid Realism**: Jangan memaksakan card berbeda memiliki tinggi sama jika isi kontennya secara alami berbeda panjang.
- **Spacing Scale**: Ikuti kelipatan 4 standar Tailwind (`gap-2`, `gap-3`, `gap-4`, `gap-6`, `p-3`, `p-4`, `p-6`). Hindari nilai sembarang.

---

## 6. Typography & Hierarchy

- **Font Family**: System Sans (`font-sans`), tajam dan teroptimasi untuk angka dan label kasir.
- **Hierarchy Scale**:
  - H1 Page Title: `text-base` hingga `text-lg font-bold text-white leading-tight`
  - H2 Section Title: `text-sm font-bold text-white`
  - Label Form: `text-xs font-semibold text-slate-300`
  - Body & Input Text: `text-xs text-slate-200`
  - Caption / Metadata: `text-[10px]` atau `text-[11px] text-slate-400 font-medium`
  - Numbers & Monetary: Angka moneter diformat jelas (`Rp ...`, font monospace jika relevan).

---

## 7. Copywriting Style (Bahasa & Komunikasi)

- **Tone**: Lugas, operasional, berorientasi tindakan, berbahasa Indonesia praktis.
- **Contoh Valid**:
  - *"Settings"*
  - *"Kelola konfigurasi bisnis dan sistem operasional."*
  - *"Informasi Bisnis & Operasional"*
  - *"Cabang & Outlet"*
  - *"Simpan Perubahan"*
  - *"Penugasan cabang karyawan untuk data cuti ini sudah tidak aktif."*
- **Dilarang Keras (AI / Generic SaaS Slop)**:
  - *"Pusat Pengaturan Bisnis Super Canggih"*
  - *"Optimalkan pengalaman bisnis Anda"*
  - *"Kelola segalanya dengan mudah dalam satu klik"*
  - *"Welcome back to your ultimate dashboard"*
  - *"Unlock the true power of your barbershop"*

---

## 8. Motion & Micro-Interactions

- **Tujuan Gerak**: Feedback status interaksi saja (misal: modal backdrop fade-in 150ms, dropdown toggle, spinner pada tombol simpan).
- **Dilarang**: Animasi mengambang (floating blobs), parallax, hover zoom berlebihan, animasi perpetual loop yang mengganggu fokus kerja.

---

## 9. Anti-Slop Bans (Hal-Hal yang Ditolak)

- ❌ Bento grid dekoratif tanpa tujuan data nyata
- ❌ Gradient ungu/merah muda khas SaaS generik
- ❌ Glassmorphism buram tanpa kontras teks yang memadai
- ❌ Glow neon berlebihan
- ❌ Background mesh, grid titik-titik (dot-grid), atau blueprint
- ❌ Giant hero banner pada halaman operasional internal
- ❌ Penggunaan emoji sebagai pengganti ikon UI formal
- ❌ Kartu statistik palsu (fake KPI cards) pada halaman konfigurasi
- ❌ Giant CTA active button pada sidebar navigasi yang menyerupai tombol submit

---

## 10. Settings Application Shell Standard

1. **Top Application Header (`PosHeader`)**:
   - Membawa identitas merek Barbershop POS, context outlet switcher interaktif, user profile & role badge, jam operasional, dan navigasi utama dengan indikator halaman aktif (`/settings`).
2. **Context Header Ringkas**:
   - Judul: `Settings`
   - Keterangan: `Kelola konfigurasi bisnis dan sistem operasional.`
   - Tombol toggle navigasi kategori mobile.
3. **Settings Sidebar Navigation**:
   - Terbagi dalam 4 kategori terstruktur:
     - **BISNIS**: Informasi Bisnis, Outlet & Cabang
     - **POS & ETALASE**: Kategori Layanan, Layanan, Kategori Produk, Produk & Retail, Metode Pembayaran
     - **OPERASIONAL**: Staff / Barber, Jadwal Kerja, Cuti / Leave
     - **AKUN & KEAMANAN**: Sub-Akun, Roles & Permissions
   - **Active State**: Elemen navigasi terpilih tampil terpadu (`bg-slate-800 text-amber-400 font-semibold border border-slate-700/80` dengan indikator aksen vertikal `border-l-2 border-amber-400`), bukan berupa tombol primary CTA oranye pekat.
4. **Content Container**:
   - Lebar terpusat responsif (`max-w-7xl mx-auto`), form dan tabel nyaman dibaca, ramah keyboard, dan tidak memiliki horizontal overflow pada perangkat mobile.
