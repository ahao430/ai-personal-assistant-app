import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { resolveImageUrl } from "@/api/asset";
import { getUserPref, setUserPref } from "@/db/repos";

export type ChatBgType = "none" | "image" | "color";
export type ChatBgSizeMode = "stretch" | "cover" | "contain" | "repeat";

export interface ChatBackgroundState {
  type: ChatBgType;
  imagePathDesktop: string;
  imagePathMobile: string;
  color: string;
  opacity: number;
  sizeMode: ChatBgSizeMode;
  blur: number;
}

const PREF_KEY = "chat_background";
const LEGACY_LOCALSTORAGE_KEY = "app_chat_background";

const DEFAULT_STATE: ChatBackgroundState = {
  type: "none",
  imagePathDesktop: "",
  imagePathMobile: "",
  color: "#0d9488",
  opacity: 100,
  sizeMode: "cover",
  blur: 0,
};

/** 把老版本 localStorage 里的绝对路径转换成相对路径（仅 images/ 之后部分） */
function absolutToRel(p: string): string {
  if (!p) return "";
  const idx = p.indexOf("/images/");
  if (idx >= 0) return p.slice(idx + "/images/".length);
  // Windows 路径
  const winIdx = p.toLowerCase().indexOf("\\images\\");
  if (winIdx >= 0) return p.slice(winIdx + "\\images\\".length).replace(/\\/g, "/");
  return p;
}

function migrateLegacy(raw: string): ChatBackgroundState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ChatBackgroundState> & { imagePath?: string };
    const migrated: ChatBackgroundState = { ...DEFAULT_STATE };
    if (parsed.type) migrated.type = parsed.type;
    if (parsed.color) migrated.color = parsed.color;
    if (typeof parsed.opacity === "number") migrated.opacity = parsed.opacity;
    if (parsed.sizeMode) migrated.sizeMode = parsed.sizeMode;
    if (typeof parsed.blur === "number") migrated.blur = parsed.blur;
    if (parsed.imagePathDesktop) migrated.imagePathDesktop = absolutToRel(parsed.imagePathDesktop);
    if (parsed.imagePathMobile) migrated.imagePathMobile = absolutToRel(parsed.imagePathMobile);
    else if (parsed.imagePath) migrated.imagePathMobile = absolutToRel(parsed.imagePath);
    return migrated;
  } catch {
    return null;
  }
}

export const useChatBackgroundStore = defineStore("chat-background", () => {
  const type = ref<ChatBgType>(DEFAULT_STATE.type);
  const imagePathDesktop = ref<string>(DEFAULT_STATE.imagePathDesktop);
  const imagePathMobile = ref<string>(DEFAULT_STATE.imagePathMobile);
  const color = ref<string>(DEFAULT_STATE.color);
  const opacity = ref<number>(DEFAULT_STATE.opacity);
  const sizeMode = ref<ChatBgSizeMode>(DEFAULT_STATE.sizeMode);
  const blur = ref<number>(DEFAULT_STATE.blur);

  const resolvedDesktopUrl = ref<string>("");
  const resolvedMobileUrl = ref<string>("");

  let loaded = false;

  async function loadFromDb() {
    const fromDb = await getUserPref<ChatBackgroundState>(PREF_KEY);
    if (fromDb) {
      type.value = fromDb.type ?? DEFAULT_STATE.type;
      imagePathDesktop.value = fromDb.imagePathDesktop ?? "";
      imagePathMobile.value = fromDb.imagePathMobile ?? "";
      color.value = fromDb.color ?? DEFAULT_STATE.color;
      opacity.value = fromDb.opacity ?? DEFAULT_STATE.opacity;
      sizeMode.value = fromDb.sizeMode ?? DEFAULT_STATE.sizeMode;
      blur.value = fromDb.blur ?? DEFAULT_STATE.blur;
      return true;
    }
    // 首次升级：尝试从 localStorage 迁移
    if (typeof localStorage !== "undefined") {
      const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
      if (legacy) {
        const migrated = migrateLegacy(legacy);
        if (migrated) {
          type.value = migrated.type;
          imagePathDesktop.value = migrated.imagePathDesktop;
          imagePathMobile.value = migrated.imagePathMobile;
          color.value = migrated.color;
          opacity.value = migrated.opacity;
          sizeMode.value = migrated.sizeMode;
          blur.value = migrated.blur;
          await persist();
          localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
          return true;
        }
      }
    }
    return false;
  }

  async function persist() {
    if (!loaded) return;
    await setUserPref(PREF_KEY, {
      type: type.value,
      imagePathDesktop: imagePathDesktop.value,
      imagePathMobile: imagePathMobile.value,
      color: color.value,
      opacity: opacity.value,
      sizeMode: sizeMode.value,
      blur: blur.value,
    });
  }

  async function refreshDesktop() {
    resolvedDesktopUrl.value = imagePathDesktop.value
      ? await resolveImageUrl(imagePathDesktop.value)
      : "";
  }
  async function refreshMobile() {
    resolvedMobileUrl.value = imagePathMobile.value
      ? await resolveImageUrl(imagePathMobile.value)
      : "";
  }

  // 启动时异步加载
  loadFromDb().finally(() => {
    loaded = true;
    refreshDesktop();
    refreshMobile();
  });

  // 监听变化时持久化
  watch([type, imagePathDesktop, imagePathMobile, color, opacity, sizeMode, blur], persist, {
    deep: true,
  });
  watch(imagePathDesktop, refreshDesktop);
  watch(imagePathMobile, refreshMobile);

  function setImage(path: string, target: "desktop" | "mobile") {
    if (target === "desktop") imagePathDesktop.value = path;
    else imagePathMobile.value = path;
    type.value = "image";
  }

  function setColor(c: string) {
    color.value = c;
    type.value = "color";
  }

  function reset() {
    type.value = "none";
    imagePathDesktop.value = "";
    imagePathMobile.value = "";
    opacity.value = 100;
    blur.value = 0;
    sizeMode.value = "cover";
  }

  return {
    type,
    imagePathDesktop,
    imagePathMobile,
    resolvedDesktopUrl,
    resolvedMobileUrl,
    color,
    opacity,
    sizeMode,
    blur,
    setImage,
    setColor,
    reset,
    loadFromDb,
  };
});
