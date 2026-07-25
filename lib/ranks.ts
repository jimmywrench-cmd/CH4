export type Rank = {
  id: string;
  name: string;
  min_level: number;
  sort_order: number;
  max_level_override?: number | null;
};

// Ranks are stored sorted by min_level ascending. A rank's
// effective max is the next tier's min_level - 1 (open-ended for
// the top tier), unless that tier has an explicit max_level_override
// set (used to cap the otherwise-infinite top tier).
export function rankForLevel(ranks: Rank[], level: number): Rank {
  const sorted = [...ranks].sort((a, b) => a.min_level - b.min_level);
  let current = sorted[0];
  for (const r of sorted) {
    if (level >= r.min_level) current = r;
    else break;
  }
  return current;
}

export function rankBounds(ranks: Rank[]): (Rank & { max_level: number })[] {
  const sorted = [...ranks].sort((a, b) => a.min_level - b.min_level);
  return sorted.map((r, i) => ({
    ...r,
    max_level: sorted[i + 1]
      ? sorted[i + 1].min_level - 1
      : r.max_level_override ?? Infinity,
  }));
}

// Custom (owner-assigned) level labels containing letters, emoji, or
// symbols opt a user out of the rank system entirely — there is no
// numeric level to compare against a tier, so no rank applies.
export function displayLevel(u: { level: number; level_label?: string | null }): string {
  return u.level_label && u.level_label.trim() ? u.level_label : String(u.level);
}

export function displayRankName(
  ranks: Rank[],
  u: { level: number; level_label?: string | null }
): string {
  if (u.level_label && u.level_label.trim()) return "—";
  return rankForLevel(ranks, u.level).name;
}

export function nextLevelInfo(ranks: Rank[], level: number) {
  const bounds = rankBounds(ranks);
  const current = bounds.find(
    (r) => level >= r.min_level && level <= r.max_level
  ) ?? bounds[bounds.length - 1];
  const levelsInRank =
    current.max_level === Infinity ? null : current.max_level - current.min_level + 1;
  const posInRank = level - current.min_level + 1;
  return { current, levelsInRank, posInRank };
}
