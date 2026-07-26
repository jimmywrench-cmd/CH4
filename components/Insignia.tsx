"use client";

import { Rank, rankBounds } from "@/lib/ranks";

const RANK_COLOR_STEPS = ["#8a8a92", "#a4a4ac", "#c2c2c8", "#e4e4e8", "#ffc94d"];

function rankColor(sortIndex: number, total: number) {
  const t = total <= 1 ? 0 : sortIndex / (total - 1);
  const idx = Math.min(RANK_COLOR_STEPS.length - 1, Math.floor(t * (RANK_COLOR_STEPS.length - 1)));
  return RANK_COLOR_STEPS[idx];
}

export default function Insignia({
  ranks,
  level,
  size = 64,
}: {
  ranks: Rank[];
  level: number;
  size?: number;
}) {
  const bounds = rankBounds(ranks);
  const current =
    bounds.find((r) => level >= r.min_level && level <= r.max_level) ?? bounds[bounds.length - 1];
  const idx = bounds.findIndex((r) => r.id === current.id);
  const color = rankColor(idx, bounds.length);

  const total = current.max_level === Infinity ? 1 : current.max_level - current.min_level + 1;
  const pos = level - current.min_level + 1;
  const pct = Math.min(1, pos / total);

  const r = size * 0.42;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * pct;

  const points = hexPoints(size / 2, size / 2, size * 0.46);

  return (
    <div className="insignia" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon
          points={points}
          fill="rgba(255,255,255,.03)"
          stroke="rgba(255,255,255,.12)"
          strokeWidth={1.5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,.08)"
          strokeWidth={size * 0.045}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.045}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)`, transition: "stroke-dasharray .5s ease" }}
        />
      </svg>
      <div className="insignia-lvl" style={{ fontSize: size * 0.26 }}>
        {level}
        <small>{current.name}</small>
      </div>
    </div>
  );
}

function hexPoints(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}
