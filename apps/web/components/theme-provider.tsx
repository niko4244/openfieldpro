"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ThemeId } from "@ofp/shared";

type Theme = "dark" | "light";

// Theme PACKS are a separate, orthogonal layer from light/dark mode: they
// reskin the accent color only (data-theme-pack attribute), so a Pro pack
// works correctly under either mode. "default" is a no-op (no CSS block).
const THEME_PACK_KEY = "ofp_theme_pack";
const DEFAULT_PACK: ThemeId = "default";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
  themePack: ThemeId;
  setThemePack: (id: ThemeId) => void;
}>({ theme: "dark", toggle: () => {}, themePack: DEFAULT_PACK, setThemePack: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [themePack, setThemePackState] = useState<ThemeId>(DEFAULT_PACK);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("ofp_theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
    const storedPack = localStorage.getItem(THEME_PACK_KEY) as ThemeId | null;
    if (storedPack) setThemePackState(storedPack);
    setMounted(true);
  }, []);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (mounted) {
      localStorage.setItem("ofp_theme", theme);
    }
  }, [theme, mounted]);

  // Sync data-theme-pack attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme-pack", themePack);
    if (mounted) {
      localStorage.setItem(THEME_PACK_KEY, themePack);
    }
  }, [themePack, mounted]);

  // ponytail: useCallback keeps the context value stable across renders, so
  // AppearanceCard's useEffect([unlocked, themePack, setThemePack]) does NOT
  // refire on every parent re-render (the guard inside that effect already
  // prevents an infinite reset loop, but refire-on-every-render still costs
  // a render + a DOM attribute write per parent re-render).
  // Ceiling: if/when a second consumer needs setThemePack and adds its own
  // effect deps, this memoization must be re-reasoned together with that
  // consumer's deps. The React useState setters (setTheme, setThemePackState)
  // are guaranteed stable by React, so deps:[] is correct here.
  // Upgrade: split theme + themePack into two separate contexts (or a
  // context-pair with a use-context-selector shim) if a profiler shows the
  // fat-context value churn becoming a hotspot under frequent re-renders.
  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  const setThemePack = useCallback(
    (id: ThemeId) => setThemePackState(id),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, themePack, setThemePack }}>
      {children}
    </ThemeContext.Provider>
  );
}
