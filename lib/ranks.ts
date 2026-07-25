export type Rank = {
  id: string;
  name: string;
  min_level: number;
  sort_order: number;
};

// Ranks are stored sorted by min_level ascending. A rank's
// effective max is the next tier's min_level - 1 (open-ended for
// the top tier). Computed on read so editing one tier's min_level
// instantly reshapes every boundary without a stored "max" column
// going stale.
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
    max_level: sorted[i + 1] ? sorted[i + 1].min_level - 1 : Infinity,
  }));
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
