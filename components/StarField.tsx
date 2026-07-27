"use client";

import { useMemo } from "react";

type Star = {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
};

function makeStars(count: number, seed: number): Star[] {
  // Small deterministic PRNG so stars don't reshuffle on every render.
  let s = seed;
  function rand() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: 1 + rand() * 2.2,
    delay: rand() * 6,
    duration: 2.2 + rand() * 3.6,
    opacity: 0.35 + rand() * 0.65,
  }));
}

export default function StarField() {
  const stars = useMemo(() => makeStars(140, 42), []);

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
