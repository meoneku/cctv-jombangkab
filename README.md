# Pantau CCTV Jombang - Multi Monitor

Aplikasi web berbasis **Next.js** dan **Node.js** untuk memantau kamera CCTV Kabupaten Jombang secara bersamaan dalam tampilan **4, 6, atau 8 monitor** sekaligus dengan dukungan mode **Full Screen** (dinding multi-monitor maupun per kamera tunggal).

Sumber daftar kamera dan stream berasal dari `https://cctv.jombangkab.go.id/v2`.

## Fitur Utama

- **Tampilan Multi-Monitor (4, 6, dan 8 Layar Bersamaan)**: Mendukung grid `2x2` (4 monitor), `3x2` (6 monitor), dan `4x2` (8 monitor).
- **Pengisian Kamera Manual**: Saat aplikasi dibuka pertama kali atau saat berpindah jumlah monitor (`4`, `6`, `8`), seluruh slot dimulai dalam keadaan kosong agar pengguna dapat memilih kamera yang ingin dipantau secara manual. Pilihan slot terakhir tersimpan otomatis di `localStorage`.
- **Mode Full Screen Ganda**:
  - **Full Screen Semua**: Menampilkan seluruh grid 4 hingga 8 monitor dalam mode layar penuh dengan bilah kontrol mengambang yang otomatis meredup saat kursor diam.
  - **Full Screen Kamera**: Memperbesar satu kamera tertentu ke layar penuh sekaligus meningkatkan batas FPS stream kamera tersebut.
- **Kontrol Overlay Menyatu dengan Gambar**: Nama lokasi, status koneksi (`Live`, `Menghubungkan`, `Terputus`, `FPS`), serta tombol aksi (`Ganti kamera`, `Simpan gambar`, `Muat ulang`, `Full Screen Kamera`, `Tutup`) melayang rapi di atas video menggunakan pill transparan, lengkap dengan tombol pengatur rasio (`Penuhi Layar` / `Aspek Asli`).
- **Tema Otomatis (Dark Mode & Light Mode)**: Menyesuaikan tampilan secara otomatis dengan pengaturan sistem perangkat (`prefers-color-scheme`), serta menyediakan tombol pengubah tema manual (`Otomatis`, `Mode Terang`, `Mode Gelap`).
- **Desain Material Design 3**: Menggunakan palet warna solid biru primer dan permukaan netral dengan elevasi shadow tipis tanpa gradasi dan tanpa warna ungu, sesuai panduan di [agent.md](./agent.md).

## Arsitektur Teknis

1. **Pengambilan Sumber & Penyegaran Token** ([src/server/cctvSource.mjs](./src/server/cctvSource.mjs)):
   Mengambil data 65 kamera dari `https://cctv.jombangkab.go.id/v2`, membaca masa berlaku token JWT ZoneMinder (`exp`), dan menyegarkan cache otomatis sebelum token kedaluwarsa.
2. **WebSocket MJPEG Multiplexer** ([src/server/mjpegMultiplexer.mjs](./src/server/mjpegMultiplexer.mjs)):
   Server Node.js membuka koneksi stream ZoneMinder (`multipart/x-mixed-replace; boundary=ZoneMinderFrame`) di sisi server, memotong tiap frame JPEG berdasarkan `Content-Length`, lalu mengirimkannya dalam paket biner melalui satu koneksi WebSocket (`/ws/streams`). Pendekatan ini menghindari batas 6 koneksi HTTP/1.1 paralel pada browser sehingga hingga 8 monitor dapat berjalan lancar bersamaan.
3. **Custom Node.js Server** ([server.mjs](./server.mjs)):
   Menyatukan aplikasi Next.js App Router dengan WebSocket server dan endpoint REST/proxy (`/api/cameras`, `/api/snapshot/:id`, `/api/stream/:id`).
4. **Canvas Renderer di Frontend** ([src/hooks/useCctvStreams.ts](./src/hooks/useCctvStreams.ts) dan [src/components/MonitorTile.tsx](./src/components/MonitorTile.tsx)):
   Mendekode frame JPEG menggunakan `createImageBitmap` dan menggambarnya langsung ke `<canvas>` pada tiap monitor agar hemat memori dan responsif.

## Prasyarat

- **Node.js** versi `22.15` atau lebih baru (proyek ini menjalankan Node.js dengan flag `--use-system-ca` agar sertifikat TLS dari `cctv.jombangkab.go.id` tervalidasi menggunakan trust store sistem operasi).
- **npm** (bawaan Node.js).

## Cara Menjalankan

1. **Instalasi dependensi**:
   ```bash
   npm install
   ```

2. **Mode Development**:
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000` di browser.

3. **Mode Production**:
   ```bash
   npm run build
   npm run start
   ```
   Buka `http://localhost:3000` di browser.

Variabel lingkungan opsional yang didukung oleh [server.mjs](./server.mjs):
- `HOST`: Alamat bind server (bawaan `0.0.0.0`).
- `PORT`: Port HTTP & WebSocket server (bawaan `3000`).

## Endpoint Server

- `GET /api/cameras`: Mengembalikan daftar kamera, daftar kategori, waktu pembaruan, dan waktu kedaluwarsa token. Tambahkan `?refresh=1` untuk mengambil ulang langsung dari server sumber.
- `GET /api/snapshot/:id`: Mengembalikan 1 frame JPEG terbaru untuk ID kamera tertentu.
- `GET /api/stream/:id`: Proxy stream MJPEG langsung untuk 1 kamera (fallback HTTP).
- `WS /ws/streams`: WebSocket multiplexer untuk berlangganan hingga 8+ kamera secara bersamaan.

## Struktur Proyek

```text
cctvjombang/
|- agent.md                         # Aturan desain UI/UX dan standar kode proyek
|- next.config.ts                   # Konfigurasi Next.js
|- package.json                     # Daftar dependensi dan skrip jalankan proyek
|- postcss.config.mjs               # Konfigurasi PostCSS Tailwind v4
|- server.mjs                       # Server HTTP + WebSocket Node.js pembungkus Next.js
|- tsconfig.json                    # Konfigurasi TypeScript
`- src/
   |- app/
   |  |- globals.css                # Token tema Material Design 3 (Light & Dark Mode)
   |  |- layout.tsx                 # Root layout dan font Roboto / Roboto Mono
   |  `- page.tsx                   # Halaman utama aplikasi
   |- components/
   |  |- CameraSidebar.tsx          # Panel pencarian, filter kategori, dan daftar kamera
   |  |- MonitorTile.tsx            # Kartu monitor dengan kontrol overlay dan Full Screen kamera
   |  `- MonitorWorkspace.tsx       # Pengelola grid 4/6/8 monitor, tema, dan Full Screen dinding
   |- hooks/
   |  `- useCctvStreams.ts          # Hook koneksi WebSocket biner dan pengukur FPS
   |- server/
   |  |- cctvSource.mjs             # Scraper daftar kamera dan pengelola token JWT
   |  `- mjpegMultiplexer.mjs       # Pemecah multipart MJPEG dan penyalur frame WebSocket
   `- types/
      `- cctv.ts                    # Definisi tipe TypeScript
```

## Panduan Pengembangan

Seluruh kontribusi kode dan antarmuka wajib mengikuti aturan pada [agent.md](./agent.md).
