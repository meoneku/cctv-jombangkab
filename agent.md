# Panduan Pengembangan Proyek CCTV Jombang (agent.md)

Dokumen ini berisi aturan wajib yang harus dipatuhi dalam seluruh penulisan kode, gaya visual, komentar, serta teks antarmuka pada proyek ini.

## 1. Larangan Penggunaan Em-Dash
- Dilarang menggunakan karakter em-dash (`\u2014`) maupun en-dash (`\u2013`) sebagai pengganti tanda baca di dalam kode sumber, komentar, dokumen markdown, maupun teks antarmuka pengguna.
- Gunakan tanda hubung biasa (`-`), koma, titik dua, atau tanda kurung bila diperlukan.

## 2. Larangan Warna Gradasi dan Warna Ungu
- Dilarang menggunakan warna gradasi dalam bentuk apa pun (`linear-gradient`, `radial-gradient`, `conic-gradient`, atau utilitas `bg-gradient-*`). Semua permukaan, tombol, latar belakang, dan indikator harus menggunakan warna solid.
- Dilarang menggunakan warna ungu, violet, indigo keunguan, magenta, atau turunannya di seluruh palet warna UI, ikon, maupun status.
- Gunakan palet biru primer, permukaan netral terang/abu-abu halus, serta warna status fungsional standar (hijau untuk aktif/live, merah untuk terputus/peringatan, kuning/oranye untuk status menghubungkan).

## 3. Bahasa UI/UX
- Seluruh teks antarmuka pengguna (label tombol, judul, menu, placeholder pencarian, notifikasi, pesan status, tooltip, dan panduan) wajib menggunakan Bahasa Indonesia yang jelas dan natural.
- Pengecualian hanya berlaku untuk istilah asing yang sudah umum dipakai di Indonesia, seperti `CCTV`, `Full Screen`, `Live`, `Online`, `Offline`, `Grid`, `Preset`, dan `FPS`.

## 4. Aturan Komentar Kode
- Gunakan komentar 1 baris (`// ...`) saja. Dilarang menggunakan komentar multi-baris (`/* ... */` atau JSDoc blok panjang).
- Komentar hanya boleh ditulis pada fungsi atau bagian kode yang bersifat khusus, kompleks, atau jarang dipakai (misalnya parsing biner multipart, penanganan TLS sertifikat intermediate, atau protokol WebSocket kustom). Jangan memberi komentar pada kode standar yang sudah jelas terbaca.
- Dilarang menggunakan kata atau frasa penekanan seperti `"FIX"`, `"FIX Bisa"`, `"HACK"`, `"MAGIC"`, `"WORKAROUND"`, atau ungkapan sejenis.

## 5. Konsep Desain Material Design 3 by Google
- Antarmuka wajib mengikuti prinsip **Material Design 3 (M3)** dari Google: hierarki permukaan tonal (Surface, Surface Container Low/Medium/High, Primary, Primary Container), sudut membulat konsisten (`12px`, `16px`, `20px`, dan `9999px` untuk pill/chip), tipografi bersih, serta komponen standar M3 seperti Top App Bar, Navigation Drawer, Filter Chips, dan Tonal/Filled Buttons.
- Gunakan shadow (elevasi) yang tipis dan halus saja (`elevation-1` atau `elevation-2`, misalnya `0 1px 2px rgba(0, 0, 0, 0.06)` atau `0 2px 6px rgba(0, 0, 0, 0.08)`). Jangan menggunakan bayangan yang tebal, gelap, atau mencolok.
