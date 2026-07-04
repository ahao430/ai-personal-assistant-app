import { defineStore } from "pinia";
import { ref } from "vue";
import { THEMES, DEFAULT_THEME_KEY, getTheme, type ThemePalette } from "@/themes";

const STORAGE_KEY = "app_theme";

function readSavedKey(): string {
  if (typeof localStorage === "undefined") return DEFAULT_THEME_KEY;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_KEY;
}

function applyTheme(theme: ThemePalette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.brandRgb)) {
    root.style.setProperty(`--brand-${k}`, v);
  }
  root.setAttribute("data-theme", theme.key);
}

export const useThemeStore = defineStore("theme", () => {
  const current = ref<ThemePalette>(getTheme(readSavedKey()));

  if (typeof document !== "undefined") {
    applyTheme(current.value);
  }

  function setTheme(key: string) {
    const t = getTheme(key);
    current.value = t;
    applyTheme(t);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, key);
    }
  }

  return { current, themes: THEMES, setTheme };
});
