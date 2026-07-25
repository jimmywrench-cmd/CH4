"use client";

import { useEffect, useState } from "react";
import { Rank } from "@/lib/ranks";

export function useRanks() {
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ranks");
      const data = await res.json();
      setRanks(data.ranks ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { ranks, loading, reload: load };
}
