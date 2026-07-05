import { defineStore } from "pinia";
import { ref, watch } from "vue";

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

const STORAGE_KEY = "app_chat_background";

const DEFAULT_STATE: ChatBackgroundState = {
  type: "none",
  imagePathDesktop: "",
  imagePathMobile: "",
  color: "#0d9488",
  opacity: 100,
  sizeMode: "cover",
  blur: 0,
};

function readSaved(): ChatBackgroundState {
  if (typeof localStorage === "undefined") return { ...DEFAULT_STATE };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<ChatBackgroundState> & { imagePath?: string };
    const migrated: ChatBackgroundState = { ...DEFAULT_STATE };
    if (parsed.type) migrated.type = parsed.type;
    if (parsed.color) migrated.color = parsed.color;
    if (typeof parsed.opacity === "number") migrated.opacity = parsed.opacity;
    if (parsed.sizeMode) migrated.sizeMode = parsed.sizeMode;
    if (typeof parsed.blur === "number") migrated.blur = parsed.blur;
    if (parsed.imagePathDesktop) migrated.imagePathDesktop = parsed.imagePathDesktop;
    if (parsed.imagePathMobile) migrated.imagePathMobile = parsed.imagePathMobile;
    else if (parsed.imagePath) migrated.imagePathMobile = parsed.imagePath;
    return migrated;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export const useChatBackgroundStore = defineStore("chat-background", () => {
  const initial = readSaved();

  const type = ref<ChatBgType>(initial.type);
  const imagePathDesktop = ref<string>(initial.imagePathDesktop);
  const imagePathMobile = ref<string>(initial.imagePathMobile);
  const color = ref<string>(initial.color);
  const opacity = ref<number>(initial.opacity);
  const sizeMode = ref<ChatBgSizeMode>(initial.sizeMode);
  const blur = ref<number>(initial.blur);

  function persist() {
    if (typeof localStorage === "undefined") return;
    const snapshot: ChatBackgroundState = {
      type: type.value,
      imagePathDesktop: imagePathDesktop.value,
      imagePathMobile: imagePathMobile.value,
      color: color.value,
      opacity: opacity.value,
      sizeMode: sizeMode.value,
      blur: blur.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  watch([type, imagePathDesktop, imagePathMobile, color, opacity, sizeMode, blur], persist, {
    deep: true,
  });

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
    color,
    opacity,
    sizeMode,
    blur,
    setImage,
    setColor,
    reset,
  };
});
