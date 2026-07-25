"use client";

// Tiny Web Audio chime generator — no external audio assets needed.
// Browsers block audio until a user gesture has happened on the page,
// so this fails silently (caught) until the user has clicked/typed once.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = 0;
  osc.connect(amp);
  amp.connect(c.destination);
  const t0 = c.currentTime + start;
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Soft two-note chime for a new announcement. */
export function playAnnouncementChime() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    tone(880, 0, 0.35, 0.09);
    tone(1318.5, 0.12, 0.4, 0.08);
  } catch {
    /* audio blocked or unsupported — ignore */
  }
}

/** Quick single blip for a generic notification. */
export function playNotifBlip() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    tone(660, 0, 0.18, 0.07);
  } catch {
    /* audio blocked or unsupported — ignore */
  }
}
