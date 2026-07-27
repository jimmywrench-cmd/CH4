"use client";

import { useState } from "react";
import { useToast } from "./Toast";

const ALLOWED_EXT = ".mp4,.mov,.webm,.mkv";

export default function UploadShortModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    setUploading(true);
    setUploadPct(0);
    try {
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
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
        xhr.send(file);
      });
      setUploading(false);

      const res = await fetch("/api/shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          video_path: signData.path,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not post short.");
        return;
      }
      toast("Short posted.");
      onUploaded();
      onClose();
    } catch {
      toast("Upload failed. Try again.");
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Upload a Short</div>
        <div className="modal-sub">
          Posts straight to Shorts — no review needed.
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Video</label>
          <div
            className={`dropzone${dragOver ? " drag" : ""}`}
            onClick={() => document.getElementById("short-file-input")?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
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
          </div>
          <input
            id="short-file-input"
            type="file"
            accept={ALLOWED_EXT}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
        </div>

        <div className="field">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give it a title (optional)"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Say something about it (optional)"
            maxLength={500}
          />
        </div>

        {(uploading || submitting) && (
          <div className="upload-progress" style={{ marginBottom: 10 }}>
            <div className="upload-progress-fill" style={{ width: `${uploading ? uploadPct : 100}%` }} />
          </div>
        )}

        <div className="flex gap8" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!file || submitting}
          >
            {submitting ? <span className="spinner" /> : "Post Short"}
          </button>
        </div>
      </div>
    </div>
  );
}
