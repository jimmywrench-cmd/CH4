"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Announcement = {
  id: number;
  title: string;
  body: string;
  created_at: string;
  posted_by_username: string | null;
  posted_by_role: string | null;
};

/**
 * Polls /api/announcements and calls onNew(a) once for every
 * announcement that shows up after the first load — used to fire
 * the chime + toast + unread badge from wherever this is mounted.
 */
export function useAnnouncements(onNew?: (a: Announcement) => void) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const seenIds = useRef<Set<number> | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements");
      const data = await res.json();
      const list: Announcement[] = data.announcements ?? [];

      if (seenIds.current === null) {
        // First load: record what already exists, don't fire chimes retroactively.
        seenIds.current = new Set(list.map((a) => a.id));
      } else {
        const fresh = list.filter((a) => !seenIds.current!.has(a.id));
        for (const a of fresh) {
          seenIds.current.add(a.id);
          onNewRef.current?.(a);
        }
      }
      setAnnouncements(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  return { announcements, loading, reload: load };
}
