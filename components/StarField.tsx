"use client";

import { useMemo } from "react";

type Dot = {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
};

function makeDots(count: number, seed: number): Dot[] {
  // Small deterministic PRNG so dots don't reshuffle on every render.
  let s = seed;
  function rand() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: 1.5 + rand() * 2.2,
    delay: rand() * 8,
    duration: 5 + rand() * 7,
    opacity: 0.35 + rand() * 0.45,
  }));
}

export default function StarField() {
  // A calm but clearly-visible field of twinkling stars — not a focal
  // point, but no longer barely-there either.
  const dots = useMemo(() => makeDots(140, 42), []);

  return (
    <div className="starfield" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            ["--dot-op" as any]: d.opacity,
          }}
        />
      ))}
    </div>
  );
}
