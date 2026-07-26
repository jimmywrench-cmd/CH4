"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, rankBounds } from "@/lib/ranks";

export default function SubmitView({ ranks }: { ranks: Rank[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(22);
  const [trimEnd, setTrimEnd] = useState(62);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (!user) return null;

  const rank = rankForLevel(ranks, user.level);
  const ready = !!(videoPath && !submitting);
  const durationSec = (((trimEnd - trimStart) / 100) * 30).toFixed(1); // assumes ~30s source, visual only

  async function handleFile(f: File) {
    setFile(f);
    setVideoPath(null);
    setUploading(true);
    setUploadPct(0);
    try {
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        toast(signData.error || "Could not start upload.");
        setUploading(false);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signData.signedUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject());
        xhr.onerror = () => reject();
        xhr.send(f);
      });

      setVideoPath(signData.path);
      toast("Clip uploaded.");
    } catch {
      toast("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submitClip() {
    if (!ready || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${user.username}'s clip — ${new Date().toLocaleDateString()}`,
          description: [`Player: ${user.username}`, desc.trim()].filter(Boolean).join("\n\n"),
          video_path: videoPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not submit.");
        return;
      }
      toast("Submitted for review.");
      setDesc("");
      setFile(null);
      setVideoPath(null);
      setTrimStart(22);
      setTrimEnd(62);
    } finally {
      setSubmitting(false);
    }
  }

  const bounds = rankBounds(ranks);

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Submit a Clip
      </div>
      <div className="grid2">
        <div className="card" style={{ padding: 26 }}>
          <div className="field">
            <label>Rule Breaker&apos;s Name</label>
            <div className="field-unlocked"></div>
          </div>
          <div className="field">
            <label>Short Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What happens in the clip? (optional)"
            />
          </div>
          <div className="grid3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field">
              <label>Current Level</label>
              <div className="field-locked">🔒 {user.level_label ?? `Level ${user.level}`}</div>
            </div>
            <div className="field">
              <label>Current Rank</label>
              <div className="field-locked">🔒 {user.level_label ? "—" : rank.name}</div>
            </div>
          </div>

          <div className="field">
            <label>Video Upload</label>
            <div
              className={`dropzone${dragOver ? " drag" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
              </svg>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {file ? file.name : "Drag & drop your clip here"}
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                or click to browse · MP4, MOV, WEBM
              </div>
              {uploading && (
                <div className="upload-progress">
                  <div className="upload-progress-fill" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
              {videoPath && !uploading && (
                <div className="small" style={{ color: "var(--green)", marginTop: 8 }}>
                  ✓ Uploaded
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".mp4,.mov,.webm,.mkv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {file && (
            <>
              <div className="notice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 9v4M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Please crop your clip so it only includes the important moment. Start the clip
                shortly before the event and end it shortly after. Long unedited recordings may
                be rejected.
              </div>
              <div className="trimmer">
                <div className="trim-preview" id="trimPreview">
                  ▶ {file.name}
                </div>
                <div className="trim-timeline">
                  <div className="trim-thumbs">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} />
                    ))}
                  </div>
                  <div
                    className="trim-select"
                    style={{ left: `${trimStart}%`, right: `${100 - trimEnd}%` }}
                  />
                </div>
                <div className="flex gap12 mb14">
                  <span className="small muted" style={{ width: 30 }}>
                    Start
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 1))}
                  />
                </div>
                <div className="flex gap12">
                  <span className="small muted" style={{ width: 30 }}>
                    End
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 1))}
                  />
                </div>
                <div className="trim-controls" style={{ marginTop: 16 }}>
                  <div className="flex gap10">
                    <span className="trim-info mono">Clip duration: ~{durationSec}s</span>
                  </div>
                  <div className="flex gap8">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTrimEnd((v) => Math.max(trimStart + 1, v - 1))}
                    >
                      ⏮ frame
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTrimEnd((v) => Math.min(100, v + 1))}
                    >
                      frame ⏭
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 22 }}>
            <button
              className="btn btn-primary"
              disabled={!ready}
              onClick={submitClip}
              style={{ width: "100%", justifyContent: "center", padding: 13 }}
            >
              {submitting ? <span className="spinner" /> : "Submit for Review"}
            </button>
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              <span className="accent-bar" />
              How Leveling Works
            </div>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              Every approved submission raises your level by exactly one. Ranks unlock
              automatically as your level climbs — no manual claiming needed.
            </p>
            <div style={{ margin: "18px 0" }}>
              <table style={{ fontSize: 12 }}>
                <tbody>
                  <tr>
                    <th>Levels</th>
                    <th>Rank</th>
                  </tr>
                  {bounds.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.min_level}
                        {r.max_level === Infinity ? "+" : `–${r.max_level}`}
                      </td>
                      <td>{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
