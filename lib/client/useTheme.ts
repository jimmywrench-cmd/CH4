"use client";

import { useEffect } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "ch4-theme";

/**
 * Applies the given theme to the document.
 *
 * - "light" / "dark": sets data-theme="light" / "dark" on <html>.
 * - "system" (or anything falsy/unset): removes the override and lets
 *   prefers-color-scheme (or your default CSS) take over.
 *
 * The choice is remembered in localStorage so the theme doesn't flash
 * back to default on the next page load, and it re-applies whenever the
 * OS-level color scheme changes while "system" is selected.
 */
export function useAppliedTheme(theme?: Theme | string | null) {
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(value?: string | null) {
      if (value === "light" || value === "dark") {
        root.setAttribute("data-theme", value);
        try {
          localStorage.setItem(STORAGE_KEY, value);
        } catch {
          // localStorage unavailable (e.g. private browsing) — ignore
        }
      } else {
        // "system" or unset: defer to prefers-color-scheme / CSS default
        root.removeAttribute("data-theme");
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }

    // Fall back to a previously saved theme if none was passed in yet
    // (e.g. user data hasn't loaded on first render).
    let effectiveTheme = theme;
    if (!effectiveTheme) {
      try {
        effectiveTheme = localStorage.getItem(STORAGE_KEY);
      } catch {
        effectiveTheme = null;
      }
    }

    applyTheme(effectiveTheme);

    // Keep "system" theme in sync with OS-level changes.
    if (!effectiveTheme || effectiveTheme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        if (!theme || theme === "system") {
          root.removeAttribute("data-theme");
        }
      };
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }
  }, [theme]);
}
