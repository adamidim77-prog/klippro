"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabaseClient";

export default function Home() {
  const [session, setSession] = useState(null);
  const [projects, setProjects] = useState([]);
  const [youtubePreview, setYoutubePreview] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [clipCount, setClipCount] = useState(4);
  const [layoutMode, setLayoutMode] = useState("auto");
  const [subtitleStyle, setSubtitleStyle] = useState("default");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProjects();
  }, [session]);

  async function loadProjects() {
    const { data } = await supabaseBrowser
      .from("projects")
      .select("*, clips(*)")
      .order("created_at", { ascending: false });
    setProjects(data || []);
  }

  async function handleYoutubePreview() {
    setError("");
    const res = await fetch("/api/youtube-preview", {
      method: "POST",
      body: JSON.stringify({ youtubeUrl }),
    });
    const data = await res.json();
    if (data.error) return setError(data.error);
    setYoutubePreview(data);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      // Upload LANGSUNG dari browser ke Cloudinary (tidak lewat server kita,
      // supaya tidak kena batas ukuran request di Vercel).
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      const publicId = `klippro_video_${session.user.id}_${Date.now()}`;

      const cloudForm = new FormData();
      cloudForm.append("file", file);
      cloudForm.append("upload_preset", uploadPreset);
      cloudForm.append("public_id", publicId);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
        { method: "POST", body: cloudForm }
      );
      const cloudData = await cloudRes.json();
      if (!cloudRes.ok) throw new Error(cloudData.error?.message || "Gagal upload ke Cloudinary.");

      const { data: project, error: insertErr } = await supabaseBrowser
        .from("projects")
        .insert({
          user_id: session.user.id,
          title: youtubePreview?.title || file.name,
          source_type: youtubePreview ? "youtube_preview" : "upload",
          video_url: cloudData.secure_url,
          video_public_id: cloudData.public_id,
          status: "uploaded",
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Mulai proses transkripsi otomatis di background
      fetch("/api/transcribe", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, videoUrl: cloudData.secure_url }),
      });

      setYoutubePreview(null);
      setYoutubeUrl("");
      loadProjects();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDetectMoments(projectId) {
    await fetch("/api/detect-moments", {
      method: "POST",
      body: JSON.stringify({ projectId, clipCount }),
    });
    loadProjects();
  }

  async function handleDriveImport() {
    if (!driveUrl) return;
    setDriveLoading(true);
    setError("");
    try {
      const res = await fetch("/api/drive-import", {
        method: "POST",
        body: JSON.stringify({ driveUrl, userId: session.user.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDriveUrl("");
      loadProjects();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setDriveLoading(false);
    }
  }

  async function handleRenderClip(clipId) {
    await fetch("/api/render-clip", {
      method: "POST",
      body: JSON.stringify({ clipId }),
    });
    loadProjects();
  }

  if (!session) return <LoginForm />;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>KlipPro</h1>
      <p>Ubah video panjang jadi klip pendek berpotensi viral.</p>

      <section style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <h3>1. Tempel link YouTube (opsional — hanya pratinjau)</h3>
        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleYoutubePreview}>Lihat Pratinjau</button>

        {youtubePreview && (
          <div style={{ marginTop: 12 }}>
            <img src={youtubePreview.thumbnail} alt="" style={{ width: "100%", borderRadius: 8 }} />
            <p><strong>{youtubePreview.title}</strong> — {youtubePreview.author}</p>
            <p style={{ fontSize: 13, opacity: 0.8 }}>{youtubePreview.note}</p>
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>2. Upload file video</h3>
        <input type="file" accept="video/*" onChange={handleUpload} disabled={uploading} />
        {uploading && <p>Mengunggah...</p>}

        <h3 style={{ marginTop: 16 }}>3. Atau tempel link Google Drive</h3>
        <p style={{ fontSize: 12, opacity: 0.7 }}>
          File harus di-share dengan akses "Anyone with the link".
        </p>
        <input
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/file/d/..."
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleDriveImport} disabled={driveLoading}>
          {driveLoading ? "Mengambil video..." : "Ambil dari Drive"}
        </button>

        {error && <p style={{ color: "salmon" }}>{error}</p>}

        <h3 style={{ marginTop: 16 }}>Pengaturan klip</h3>
        <label style={{ display: "block", marginBottom: 8 }}>
          Jumlah klip:{" "}
          <select value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))}>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={6}>6</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Mode layout:{" "}
          <select value={layoutMode} onChange={(e) => setLayoutMode(e.target.value)}>
            <option value="auto">Auto (aktif)</option>
            <option value="split" disabled>Split screen (segera hadir)</option>
            <option value="face_tracking" disabled>Face tracking (segera hadir)</option>
          </select>
        </label>
        <label style={{ display: "block" }}>
          Gaya subtitle:{" "}
          <select value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}>
            <option value="default">Default (aktif)</option>
            <option value="viral_pop" disabled>Viral Pop (segera hadir)</option>
          </select>
        </label>
      </section>

      <h2>Proyek Saya</h2>
      {projects.map((p) => (
        <div key={p.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <strong>{p.title}</strong>
          <p>Status: {p.status} {p.error_message && `— ${p.error_message}`}</p>

          {p.status === "transcribed" && (
            <button onClick={() => handleDetectMoments(p.id)}>Deteksi Momen Viral ({clipCount} klip)</button>
          )}

          {p.clips?.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid #333", marginTop: 8, paddingTop: 8 }}>
              <p><strong>{c.hook_title}</strong></p>
              <p style={{ fontSize: 12, opacity: 0.7 }}>{c.viral_reason}</p>
              <p style={{ fontSize: 12 }}>Status render: {c.render_status} {c.render_error && `— ${c.render_error}`}</p>
              {c.render_status === "pending" && (
                <button onClick={() => handleRenderClip(c.id)}>Render Klip</button>
              )}
              {c.render_url && (
                <video src={c.render_url} controls style={{ width: "100%", marginTop: 8 }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const fn = mode === "login" ? "signInWithPassword" : "signUp";
    const { error } = await supabaseBrowser.auth[fn]({ email, password });
    if (error) setError(error.message);
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>KlipPro</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
      {error && <p style={{ color: "salmon" }}>{error}</p>}
      <button onClick={submit} style={{ width: "100%", padding: 10 }}>
        {mode === "login" ? "Masuk" : "Daftar"}
      </button>
      <p onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ cursor: "pointer", marginTop: 8 }}>
        {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
      </p>
    </main>
  );
    }
         
