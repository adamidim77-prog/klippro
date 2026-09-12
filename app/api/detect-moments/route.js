import { supabaseServer } from "../../../lib/supabaseClient";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

function sliceTranscript(words, startMs, endMs) {
  return words
    .filter((w) => w.start >= startMs && w.end <= endMs)
    .map((w) => w.text)
    .join(" ");
}

async function askGemini(prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini menolak permintaan: ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function POST(req) {
  const { projectId, clipCount } = await req.json();
  const targetCount = clipCount || 4;
  const db = supabaseServer();

  try {
    const { data: project } = await db
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!project?.transcript?.words?.length) {
      throw new Error("Transkrip belum tersedia untuk proyek ini.");
    }

    const { words, full_text } = project.transcript;

    // SATU kali panggilan AI untuk semuanya (kandidat momen + judul hook
    // sekaligus) — sengaja digabung supaya tidak kena limit "5 permintaan
    // per menit" di tier gratis Gemini.
    const candidatesRaw = await askGemini(
      `Berikut transkrip lengkap sebuah video (Bahasa Indonesia):\n\n"""${full_text}"""\n\nUsulkan tepat ${targetCount} momen (durasi 20-90 detik) yang paling berpotensi viral untuk TikTok/Reels/Shorts. Untuk SETIAP momen, buat juga judul/hook pendek (maks 12 kata) berdasarkan isi momen itu sendiri. Balas HANYA JSON array, format: [{"start_hint": "kutipan kalimat awal momen (persis dari transkrip)", "end_hint": "kutipan kalimat akhir momen (persis dari transkrip)", "reason": "alasan singkat kenapa menarik", "hook_title": "judul pendek untuk klip ini"}]. Jangan tambahkan teks lain di luar JSON.`
    );
    const candidates = JSON.parse(candidatesRaw.replace(/```json|```/g, "").trim());

    const clipsToInsert = [];

    for (const c of candidates) {
      const startIdx = full_text.indexOf(c.start_hint);
      const endIdx = full_text.indexOf(c.end_hint) + (c.end_hint?.length || 0);
      if (startIdx === -1 || endIdx === -1) continue;

      const totalChars = full_text.length;
      const firstWordMs = words[0]?.start || 0;
      const lastWordMs = words[words.length - 1]?.end || 0;
      const totalMs = lastWordMs - firstWordMs;

      const startMs = firstWordMs + Math.floor((startIdx / totalChars) * totalMs);
      const endMs = firstWordMs + Math.floor((endIdx / totalChars) * totalMs);

      const clipTranscript = sliceTranscript(words, startMs, endMs);
      if (!clipTranscript) continue;

      clipsToInsert.push({
        project_id: projectId,
        start_ms: startMs,
        end_ms: endMs,
        clip_transcript: clipTranscript,
        hook_title: c.hook_title,
        viral_reason: c.reason,
        render_status: "pending",
      });
    }

    if (clipsToInsert.length === 0) {
      throw new Error(
        "Tidak ada momen yang berhasil dipetakan ke timestamp. Coba video dengan transkrip lebih jelas."
      );
    }

    await db.from("clips").insert(clipsToInsert);
    await db.from("projects").update({ status: "moments_detected" }).eq("id", projectId);

    return Response.json({ ok: true, clipCount: clipsToInsert.length });
  } catch (err) {
    await db
      .from("projects")
      .update({ status: "error", error_message: String(err) })
      .eq("id", projectId);
    return Response.json({ error: String(err) }, { status: 500 });
  }
                         }
