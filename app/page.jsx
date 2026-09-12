"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabaseClient";

function formatTimecode(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

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
    <main className="wrap">
      <div className="hero">
        <h1>KlipPro</h1>
        <p>Tempel video panjang, AI carikan momen-momen yang layak jadi klip pendek.</p>
      </div>

      <div className="step">
        <div className="step-label"><span className="tick" />Sumber video</div>

        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="Tempel link YouTube (opsional, hanya pratinjau)"
        />
        <button className="btn btn-secondary" onClick={handleYoutubePreview}>Lihat Pratinjau</button>

        {youtubePreview && (
          <div style={{ marginTop: 12 }}>
            <img src={youtubePreview.thumbnail} alt="" style={{ width: "100%", borderRadius: 10 }} />
            <p className="project-title" style={{ marginTop: 8 }}>{youtubePreview.title}</p>
            <p className="clip-reason">{youtubePreview.note}</p>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <input type="file" accept="video/*" onChange={handleUpload} disabled={uploading} />
          {uploading && <p className="clip-reason">Mengunggah ke Cloudinary...</p>}
        </div>

        <div style={{ marginTop: 18 }}>
          <p className="clip-reason" style={{ marginBottom: 8 }}>
            Atau tempel link Google Drive (file harus di-share "Anyone with the link"):
          </p>
          <input
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/..."
          />
          <button className="btn btn-secondary" onClick={handleDriveImport} disabled={driveLoading}>
            {driveLoading ? "Mengambil video..." : "Ambil dari Drive"}
          </button>
        </div>

        {error && <p className="error-msg">{error}</p>}
      </div>

      <div className="settings">
        <div className="settings-row">
          <span>Jumlah klip</span>
          <select value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))}>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={6}>6</option>
          </select>
        </div>
        <div className="settings-row">
          <span>Mode layout</span>
          <select value={layoutMode} onChange={(e) => setLayoutMode(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="split" disabled>Split screen (segera)</option>
            <option value="face_tracking" disabled>Face tracking (segera)</option>
          </select>
        </div>
        <div className="settings-row">
          <span>Gaya subtitle</span>
          <select value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}>
            <option value="default">Default</option>
            <option value="viral_pop" disabled>Viral Pop (segera)</option>
          </select>
        </div>
      </div>

      <h2 className="section-title">Proyek Saya</h2>
      {projects.length === 0 && (
        <p className="clip-reason">Belum ada video. Upload satu di atas untuk mulai.</p>
      )}

      {projects.map((p) => (
        <div key={p.id} className="project">
          <p className="project-title">{p.title}</p>
          <span className={`status-pill ${p.status === "moments_detected" ? "ready" : ""} ${p.status === "error" ? "error" : ""}`}>
            {p.status}
          </span>
          {p.error_message && <p className="error-msg">{p.error_message}</p>}

          {p.status === "transcribed" && (
            <button className="btn btn-primary" onClick={() => handleDetectMoments(p.id)}>
              Deteksi Momen Viral · {clipCount} klip
            </button>
          )}

          {p.clips?.map((c) => (
            <div key={c.id} className="clip">
              <p className="clip-hook">{c.hook_title}</p>
              <p className="clip-reason">
                <span className="timecode">{formatTimecode(c.start_ms)}–{formatTimecode(c.end_ms)}</span>
                {"  ·  "}{c.viral_reason}
              </p>

              {c.render_status === "pending" && (
                <button className="btn btn-primary" onClick={() => handleRenderClip(c.id)}>
                  ✂ Potong Video Ini
                </button>
              )}
              {c.render_status === "error" && (
                <>
                  <p className="error-msg">{c.render_error}</p>
                  <button className="btn btn-secondary" onClick={() => handleRenderClip(c.id)}>
                    Coba Potong Lagi
                  </button>
                </>
              )}
              {c.render_url && <video src={c.render_url} controls />}
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
    <main className="login-wrap">
      <div className="hero" style={{ border: "none", paddingTop: 0 }}>
        <h1>KlipPro</h1>
        <p>Masuk untuk mulai memotong video.</p>
      </div>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 10 }} />
      {error && <p className="error-msg">{error}</p>}
      <button className="btn btn-primary" onClick={submit}>
        {mode === "login" ? "Masuk" : "Daftar"}
      </button>
      <p className="link-toggle" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
      </p>
    </main>
  );
    }
