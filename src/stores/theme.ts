import { defineStore } from "pinia";
import { ref } from "vue";
import { THEMES, DEFAULT_THEME_KEY, getTheme, type ThemePalette } from "@/themes";
import { getUserPref, setUserPref } from "@/db/repos";

const STORAGE_KEY = "app_theme";
const USER_PREF_KEY = "theme";

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

  async function init() {
    const pref = await getUserPref<string>(USER_PREF_KEY);
    if (pref) {
      const t = getTheme(pref);
      if (t.key !== current.value.key) {
        current.value = t;
        applyTheme(t);
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, t.key);
        }
      }
    } else {
      // migrate localStorage → user_prefs
      await setUserPref(USER_PREF_KEY, current.value.key);
    }
  }

  async function setTheme(key: string) {
    const t = getTheme(key);
    current.value = t;
    applyTheme(t);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, key);
    }
    await setUserPref(USER_PREF_KEY, key).catch(() => {});
  }

  return { current, themes: THEMES, init, setTheme };
});
