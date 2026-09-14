"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabaseClient";

function formatTimecode(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function sourceLabel(type) {
  if (type === "youtube_preview") return "YouTube";
  if (type === "google_drive") return "Google Drive";
  return "Upload";
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
  const [detectingId, setDetectingId] = useState(null);
  const [renderingId, setRenderingId] = useState(null);
  const [tab, setTab] = useState("beranda");

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProjects();
  }, [session]);

  useEffect(() => {
    const stillProcessing = projects.some((p) => p.status === "uploaded" || p.status === "transcribing");
    if (!stillProcessing) return;
    const interval = setInterval(loadProjects, 5000);
    return () => clearInterval(interval);
  }, [projects]);

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
    setDetectingId(projectId);
    await fetch("/api/detect-moments", {
      method: "POST",
      body: JSON.stringify({ projectId, clipCount, subtitleStyle }),
    });
    await loadProjects();
    setDetectingId(null);
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
    setRenderingId(clipId);
    await fetch("/api/render-clip", {
      method: "POST",
      body: JSON.stringify({ clipId }),
    });
    await loadProjects();
    setRenderingId(null);
  }

  async function handleDeleteProject(projectId) {
    if (!confirm("Hapus proyek ini beserta semua klipnya?")) return;
    await supabaseBrowser.from("clips").delete().eq("project_id", projectId);
    await supabaseBrowser.from("projects").delete().eq("id", projectId);
    loadProjects();
  }

  async function handleSignOut() {
    await supabaseBrowser.auth.signOut();
  }

  if (!session) return <LoginForm />;

  return (
    <main className="wrap">
      <div className="topbar">
        <span className="brand">KlipPro</span>
      </div>

      {tab === "beranda" && (
        <>
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
        </>
      )}

      {tab === "proyek" && (
        <>
      <h2 className="section-title" style={{ marginTop: 8 }}>Proyek Saya</h2>
      {projects.length === 0 && (
        <p className="clip-reason">Belum ada video. Upload dulu di tab Beranda.</p>
      )}

      {projects.map((p) => (
        <div key={p.id} className="project">
          <div className="project-head">
            {p.video_public_id && (
              <img
                className="project-thumb"
                src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/video/upload/so_0/${p.video_public_id}.jpg`}
                alt=""
              />
            )}
            <div className="project-meta">
              <div className="source-badge"><span className="dot" />{sourceLabel(p.source_type)}</div>
              <p className="project-title">{p.title}</p>
              <span className={`status-pill ${p.status === "moments_detected" ? "ready" : ""} ${p.status === "error" ? "error" : ""}`}>
                {p.status}
              </span>
              {p.error_message && <p className="error-msg">{p.error_message}</p>}
            </div>
            <button
              onClick={() => handleDeleteProject(p.id)}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4, flexShrink: 0 }}
              aria-label="Hapus proyek"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </button>
          </div>

          {p.status === "transcribed" && (
            <button className="btn btn-primary" onClick={() => handleDetectMoments(p.id)} disabled={detectingId === p.id}>
              {detectingId === p.id ? "Menganalisis video..." : `Deteksi Momen Viral · ${clipCount} klip`}
            </button>
          )}
          {p.status === "error" && (
            <button className="btn btn-secondary" onClick={() => handleDetectMoments(p.id)} disabled={detectingId === p.id}>
              {detectingId === p.id ? "Mencoba lagi..." : "Coba Lagi"}
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
                <button className="btn btn-primary" onClick={() => handleRenderClip(c.id)} disabled={renderingId === c.id}>
                  {renderingId === c.id ? "Memotong video..." : "✂ Potong Video Ini"}
                </button>
              )}
              {c.render_status === "error" && (
                <>
                  <p className="error-msg">{c.render_error}</p>
                  <button className="btn btn-secondary" onClick={() => handleRenderClip(c.id)} disabled={renderingId === c.id}>
                    {renderingId === c.id ? "Memotong video..." : "Coba Potong Lagi"}
                  </button>
                </>
              )}
              {c.render_url && <video src={c.render_url} controls />}
            </div>
          ))}
        </div>
      ))}
        </>
      )}

      {tab === "pengaturan" && (
        <>
          <h2 className="section-title" style={{ marginTop: 8 }}>Pengaturan</h2>
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
                <option value="default">Default (putih)</option>
                <option value="viral_pop">Viral Pop (kuning)</option>
              </select>
            </div>
          </div>
          <p className="clip-reason" style={{ marginTop: 14 }}>
            Pengaturan ini berlaku untuk video baru yang diproses.
          </p>
        </>
      )}

      {tab === "akun" && (
        <>
          <h2 className="section-title" style={{ marginTop: 8 }}>Akun</h2>
          <div className="account-card">
            <p className="email">{session.user.email}</p>
            <button className="btn btn-secondary" onClick={handleSignOut}>Keluar</button>
          </div>
        </>
      )}

      <nav className="bottom-nav">
        <button className={tab === "beranda" ? "active" : ""} onClick={() => setTab("beranda")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
          Beranda
        </button>
        <button className={tab === "proyek" ? "active" : ""} onClick={() => setTab("proyek")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          Proyek
        </button>
        <button className={tab === "pengaturan" ? "active" : ""} onClick={() => setTab("pengaturan")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          Pengaturan
        </button>
        <button className={tab === "akun" ? "active" : ""} onClick={() => setTab("akun")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></svg>
          Akun
        </button>
      </nav>
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
