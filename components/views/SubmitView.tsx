"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankBounds } from "@/lib/ranks";

export default function SubmitView({ ranks }: { ranks: Rank[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [ruleBreaker, setRuleBreaker] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);

  const [processing, setProcessing] = useState(false);
  const [processPct, setProcessPct] = useState(0);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!user) return null;

  const durationSec = videoDuration
    ? (((trimEnd - trimStart) / 100) * videoDuration).toFixed(1)
    : "—";
  const trimmed = !!videoPath;
  const readyToTrim = !!(file && videoDuration > 0 && !processing && !uploading);
  const readyToSubmit = !!(trimmed && ruleBreaker.trim() && !submitting);

  function selectFile(f: File) {
    setFile(f);
    setVideoPath(null);
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(100);
  }

  function onLoadedMetadata() {
    const d = videoRef.current?.duration;
    if (!d || !Number.isFinite(d)) return;
    setVideoDuration(d);
    // Default to the first 30s (or the whole clip, if shorter) so there's
    // already something sensible to submit before anyone drags a handle.
    setTrimEnd(d > 30 ? (30 / d) * 100 : 100);
  }

  function dragTrimHandle(e: React.PointerEvent, which: "start" | "end") {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    if (which === "start") setTrimStart(Math.min(pct, trimEnd - 1));
    else setTrimEnd(Math.max(pct, trimStart + 1));
  }

  // Cuts out just the selected window using the browser's own
  // decode/record pipeline (captureStream + MediaRecorder) — no
  // server-side ffmpeg needed. It has to play through the trimmed
  // section in real time to capture it, so this takes as long as
  // the clip itself.
  async function trimAndUpload() {
    if (!file || !videoRef.current || !videoDuration) return;
    const videoEl = videoRef.current;
    const startSec = (trimStart / 100) * videoDuration;
    const endSec = (trimEnd / 100) * videoDuration;
    if (endSec - startSec < 0.4) {
      toast("Select at least half a second to submit.");
      return;
    }

    const canCapture = typeof (videoEl as any).captureStream === "function";
    if (!canCapture) {
      // Fall back to uploading the untrimmed file rather than blocking
      // submission entirely on an older/unsupported browser.
      toast("This browser can't trim locally — uploading the full clip instead.");
      setVideoPath(null);
      await uploadBlob(file, file.name);
      return;
    }

    setProcessing(true);
    setProcessPct(0);
    setVideoPath(null);
    const wasMuted = videoEl.muted;

    try {
      const stream: MediaStream = (videoEl as any).captureStream();

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      if (!mimeType) throw new Error("no-recorder-format");

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.onerror = () => reject(new Error("Recording failed."));
      });

      // Mute local playback only — captureStream taps the decoded
      // audio track directly, so the recording keeps sound either way.
      videoEl.muted = true;
      videoEl.currentTime = startSec;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          videoEl.removeEventListener("seeked", onSeeked);
          resolve();
        };
        videoEl.addEventListener("seeked", onSeeked);
      });

      recorder.start();
      await videoEl.play();

      await new Promise<void>((resolve) => {
        function onTimeUpdate() {
          setProcessPct(
            Math.min(100, Math.max(0, ((videoEl.currentTime - startSec) / (endSec - startSec)) * 100))
          );
          if (videoEl.currentTime >= endSec) {
            videoEl.removeEventListener("timeupdate", onTimeUpdate);
            resolve();
          }
        }
        videoEl.addEventListener("timeupdate", onTimeUpdate);
      });

      videoEl.pause();
      recorder.stop();
      const blob = await stopped;

      await uploadBlob(blob, "clip.webm");
    } catch (err) {
      console.error(err);
      toast("Could not trim that clip locally — try adjusting the handles and try again.");
    } finally {
      videoEl.muted = wasMuted;
      setProcessing(false);
    }
  }

  async function uploadBlob(blob: Blob, filename: string) {
    setUploading(true);
    setUploadPct(0);
    try {
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) {
        toast(signData.error || "Could not start upload.");
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
        xhr.send(blob);
      });

      setVideoPath(signData.path);
      toast("Clip trimmed and uploaded.");
    } catch {
      toast("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submitClip() {
    if (!readyToSubmit || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${user.username}'s clip — ${new Date().toLocaleDateString()}`,
          description: [
            `Player: ${user.username}`,
            ruleBreaker.trim() ? `Rule Breaker: ${ruleBreaker.trim()}` : "",
            desc.trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
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
      setRuleBreaker("");
      setFile(null);
      setVideoPath(null);
      setVideoDuration(0);
      setTrimStart(0);
      setTrimEnd(100);
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
            <label>Rule Breaker&apos;s Name *</label>
            <input
              type="text"
              value={ruleBreaker}
              onChange={(e) => setRuleBreaker(e.target.value)}
              placeholder="Who broke the rule?"
              maxLength={40}
            />
          </div>
          <div className="field">
            <label>Short Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What happens in the clip? (optional)"
            />
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
                if (f) selectFile(f);
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
              {trimmed && !uploading && !processing && (
                <div className="small" style={{ color: "var(--green)", marginTop: 8 }}>
                  ✓ Trimmed clip uploaded
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
                if (f) selectFile(f);
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
                {videoUrl && (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className="trim-video"
                    onLoadedMetadata={onLoadedMetadata}
                  />
                )}
                <div className="trim-timeline" ref={timelineRef}>
                  <div className="trim-thumbs">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} />
                    ))}
                  </div>
                  <div
                    className="trim-select"
                    style={{ left: `${trimStart}%`, right: `${100 - trimEnd}%` }}
                  >
                    <div
                      className="trim-handle trim-handle-start"
                      onPointerDown={(e) => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
                      onPointerMove={(e) => {
                        if (e.buttons === 1) dragTrimHandle(e, "start");
                      }}
                    />
                    <div
                      className="trim-handle trim-handle-end"
                      onPointerDown={(e) => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
                      onPointerMove={(e) => {
                        if (e.buttons === 1) dragTrimHandle(e, "end");
                      }}
                    />
                  </div>
                </div>
                <div className="trim-controls" style={{ marginTop: 4 }}>
                  <span className="trim-info mono">Clip duration: ~{durationSec}s</span>
                  <span className="small muted">Drag the handles to trim the clip</span>
                </div>

                <div style={{ marginTop: 16 }}>
                  {(processing || uploading) && (
                    <div className="upload-progress" style={{ marginBottom: 10 }}>
                      <div
                        className="upload-progress-fill"
                        style={{ width: `${processing ? processPct : uploadPct}%` }}
                      />
                    </div>
                  )}
                  <button
                    className="btn btn-ghost"
                    disabled={!readyToTrim}
                    onClick={trimAndUpload}
                    style={{ width: "100%", justifyContent: "center", padding: 12 }}
                  >
                    {processing
                      ? "Trimming clip…"
                      : uploading
                      ? "Uploading…"
                      : trimmed
                      ? "Re-trim clip"
                      : "Trim & Upload Clip"}
                  </button>
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 22 }}>
            <button
              className="btn btn-primary"
              disabled={!readyToSubmit}
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
