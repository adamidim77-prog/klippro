# KlipPro

Aplikasi cliper video: upload video / tempel link Google Drive → AI deteksi
beberapa momen viral sekaligus → reframe 9:16 → subtitle otomatis.

## Kenapa tidak pakai Supabase Storage?

Supabase Storage gratis dibatasi 50MB per file, dan batas itu tidak bisa
dinaikkan tanpa upgrade ke paket berbayar. Video di aplikasi ini disimpan
**langsung di Cloudinary** (batas gratisnya 100MB per video — lebih lega, dan
memang di situ juga video-nya diproses buat reframe+subtitle). Supabase di
sini hanya dipakai untuk login & database, jadi setup jadi lebih sederhana
(tidak perlu bikin storage bucket atau policy sama sekali).

## Catatan penting soal YouTube

YouTube **tidak** bisa diambil otomatis (hanya pratinjau judul/thumbnail),
karena mengunduh video YouTube melanggar Ketentuan Layanan mereka. Video
YouTube tetap harus di-upload manual oleh pengguna.

Google Drive berbeda — itu video milik pengguna sendiri, jadi boleh diambil
otomatis asal file-nya di-share publik ("Anyone with the link").

## Setup

1. Buat project Supabase baru → jalankan SQL di `lib/supabaseClient.js` (bagian komentar di bawah) lewat SQL Editor. **Tidak perlu bikin storage bucket.**
2. Di Authentication → Sign In/Providers → matikan "Confirm email".
3. Buat akun Cloudinary (gratis) → di Settings → Upload → buat **Upload Preset baru**, mode **Unsigned**, catat nama presetnya (dipakai browser buat upload langsung, aman karena tidak butuh API secret).
4. Siapkan API key: AssemblyAI, Google Gemini (keduanya ada tier gratis).
5. Upload kode ini ke GitHub (repo baru).
6. Deploy ke Vercel, isi environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
   - NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET (nama preset unsigned dari langkah 3)
   - CLOUDINARY_API_KEY
   - CLOUDINARY_API_SECRET
   - ASSEMBLYAI_API_KEY
   - GEMINI_API_KEY

Detail langkah-langkah ini bisa dipandu bertahap — tinggal bilang aja mau mulai dari mana.
