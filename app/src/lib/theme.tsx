"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "metaguard-theme";

/** Inlined into the document: it must run before first paint, not after hydration. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var theme = stored === "light" || stored === "dark" ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`.trim();

// The theme lives in localStorage and the OS colour-scheme setting, not in
// React — an external store avoids an effect that writes state on mount, and
// lets useSyncExternalStore handle the server/client snapshot difference.

const listeners = new Set<() => void>();
let cachedTheme: Theme | null = null;

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage can be blocked; fall back to following the system */
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getTheme(): Theme {
  if (cachedTheme === null) cachedTheme = readStoredTheme();
  return cachedTheme;
}

function getResolvedTheme(): ResolvedTheme {
  const theme = getTheme();
  return theme === "system" ? systemTheme() : theme;
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // Re-applying an unchanged theme is free, so no need to resubscribe per theme.
  const onMediaChange = () => {
    apply(getResolvedTheme());
    onChange();
  };
  media.addEventListener("change", onMediaChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onMediaChange);
  };
}

export function setTheme(next: Theme) {
  cachedTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* a preference we can't persist is still worth honouring for this visit */
  }
  apply(getResolvedTheme());
  emit();
}

// The server can't know the preference; the inline script has already applied
// the real one to <html> by the time React hydrates against these.
const serverTheme = (): Theme => "system";
const serverResolvedTheme = (): ResolvedTheme => "dark";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, serverTheme);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolvedTheme, serverResolvedTheme);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}
