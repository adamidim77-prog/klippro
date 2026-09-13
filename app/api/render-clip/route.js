import { cloudinaryUpload } from "../../../lib/cloudinary";
import { supabaseServer } from "../../../lib/supabaseClient";

function buildSrt(words, startMs, endMs) {
  const clipWords = words.filter((w) => w.start >= startMs && w.end <= endMs);
  let srt = "";
  let idx = 1;
  for (let i = 0; i < clipWords.length; i += 6) {
    const chunk = clipWords.slice(i, i + 6);
    const lineStart = chunk[0].start - startMs;
    const lineEnd = chunk[chunk.length - 1].end - startMs;
    const text = chunk.map((w) => w.text).join(" ");
    srt += `${idx}\n${msToSrtTime(lineStart)} --> ${msToSrtTime(lineEnd)}\n${text}\n\n`;
    idx++;
  }
  return srt;
}

function msToSrtTime(ms) {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const msRem = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${msRem}`;
}

export async function POST(req) {
  const { clipId } = await req.json();
  const db = supabaseServer();

  try {
    const { data: clip } = await db.from("clips").select("*, projects(*)").eq("id", clipId).single();
    if (!clip) throw new Error("Klip tidak ditemukan.");

    const words = clip.projects.transcript.words;
    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    let videoPublicId = clip.projects.video_public_id;
    if (!videoPublicId) {
      videoPublicId = `klippro_video_fallback_${clip.projects.id}`;
      await cloudinaryUpload({ file: clip.projects.video_url, publicId: videoPublicId, resourceType: "video" });
      await db.from("projects").update({ video_public_id: videoPublicId }).eq("id", clip.projects.id);
    }

    const srtContent = buildSrt(words, clip.start_ms, clip.end_ms);
    const srtUpload = await cloudinaryUpload({
      file: new Blob([srtContent], { type: "text/plain" }),
      publicId: `klippro_srt_${clipId}`,
      resourceType: "raw",
      format: "srt",
    });

    const startSec = (clip.start_ms / 1000).toFixed(2);
    const durationSec = ((clip.end_ms - clip.start_ms) / 1000).toFixed(2);

    const transformation = [
      `so_${startSec},du_${durationSec}`,
      "ar_9:16,c_fill,g_auto",
      `l_subtitles:${srtUpload.public_id}.srt,co_white,g_south,y_40`,
      "fl_layer_apply",
    ].join("/");

    const renderUrl = `https://res.cloudinary.com/${cloud}/video/upload/${transformation}/${videoPublicId}.mp4`;

    let check;
    for (let attempt = 0; attempt < 8; attempt++) {
      check = await fetch(renderUrl, { method: "HEAD" });
      if (check.ok) break;
      if (check.status !== 423) break;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    if (!check.ok) {
      throw new Error(
        `Render belum tersedia (status ${check.status}). Catatan: gravity_auto Cloudinary adalah content-aware cropping, BUKAN face-tracking dinamis per-frame sungguhan.`
      );
    }

    await db
      .from("clips")
      .update({ render_url: renderUrl, render_status: "done", render_error: null })
      .eq("id", clipId);

    return Response.json({ ok: true, renderUrl });
  } catch (err) {
    await db
      .from("clips")
      .update({ render_status: "error", render_error: String(err) })
      .eq("id", clipId);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
