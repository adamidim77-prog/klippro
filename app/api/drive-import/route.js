// Mengambil video langsung dari link Google Drive milik pengguna sendiri, lalu
// menyerahkan URL-nya ke Cloudinary (Cloudinary yang ambil sendiri di server
// mereka — kita tidak perlu download-lalu-upload manual, jadi tidak kena batas
// ukuran request server kita).
//
// Ini BEDA dengan YouTube: video di Drive adalah milik pengguna sendiri (atau
// sudah dia dapat izin), jadi aman diambil otomatis — bukan mengunduh dari
// platform pihak ketiga yang dilarang ToS-nya seperti YouTube.
//
// Syarat: file di Drive harus di-share dengan akses "Anyone with the link".

import { cloudinaryUpload } from "../../../lib/cloudinary";
import { supabaseServer } from "../../../lib/supabaseClient";

function extractDriveFileId(url) {
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req) {
  const db = supabaseServer();
  try {
    const { driveUrl, userId, title } = await req.json();
    if (!driveUrl) {
      return Response.json({ error: "Link Google Drive kosong." }, { status: 400 });
    }

    const fileId = extractDriveFileId(driveUrl);
    if (!fileId) {
      return Response.json(
        { error: "Link Google Drive tidak dikenali. Pastikan formatnya seperti https://drive.google.com/file/d/.../view" },
        { status: 422 }
      );
    }

    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const publicId = `klippro_video_${userId}_drive_${fileId}`;

    let uploadResult;
    try {
      uploadResult = await cloudinaryUpload({ file: directUrl, publicId, resourceType: "video" });
    } catch (err) {
      throw new Error(
        "Gagal mengambil video dari Drive. Pastikan file di-share dengan akses 'Anyone with the link', dan ukurannya di bawah 100MB (batas gratis Cloudinary)."
      );
    }

    const { data: project, error: insertErr } = await db
      .from("projects")
      .insert({
        user_id: userId,
        title: title || "Video dari Google Drive",
        source_type: "google_drive",
        video_url: uploadResult.secure_url,
        video_public_id: uploadResult.public_id,
        status: "uploaded",
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
    fetch(`${origin}/api/transcribe`, {
      method: "POST",
      body: JSON.stringify({ projectId: project.id, videoUrl: uploadResult.secure_url }),
    }).catch(() => {});

    return Response.json({ ok: true, project });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
                           }
    
