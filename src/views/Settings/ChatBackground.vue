<script setup lang="ts">
import { computed, ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import { Button, Cell, CellGroup, Slider, showToast } from "vant";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  useChatBackgroundStore,
  type ChatBgSizeMode,
} from "@/stores/chat-background";
import { useLayoutMode } from "@/composables/useLayoutMode";

const store = useChatBackgroundStore();
const { isDesktop } = useLayoutMode();
const importing = ref(false);

const PRESET_COLORS = [
  "#0d9488",
  "#0369a1",
  "#15803d",
  "#ea580c",
  "#7c3aed",
  "#e11d48",
  "#1f2937",
  "#fafaf9",
];

const SIZE_MODES: { value: ChatBgSizeMode; label: string; hint: string }[] = [
  { value: "cover", label: "覆盖", hint: "填满区域，可能裁剪" },
  { value: "contain", label: "完整", hint: "完整显示，可能留白" },
  { value: "stretch", label: "拉伸", hint: "变形铺满" },
  { value: "repeat", label: "平铺", hint: "重复排列" },
];

const pickerOpen = ref(false);

const previewImageUrl = computed(
  () => (isDesktop.value ? store.resolvedDesktopUrl : store.resolvedMobileUrl) || ""
);

const previewStyle = computed<Record<string, string>>(() => {
  const base: Record<string, string> = {};
  const opacity = Math.max(0, Math.min(1, store.opacity / 100));
  if (store.type === "color") {
    base["background-color"] = store.color;
    base["opacity"] = String(opacity);
  } else if (store.type === "image" && previewImageUrl.value) {
    base["background-image"] = `url("${previewImageUrl.value}")`;
    base["opacity"] = String(opacity);
    if (store.blur > 0) base["filter"] = `blur(${store.blur}px)`;
  }
  return base;
});

const previewBgClass = computed(() => {
  switch (store.sizeMode) {
    case "cover":
      return "bg-cover bg-center bg-no-repeat";
    case "contain":
      return "bg-contain bg-center bg-no-repeat";
    case "stretch":
      return "bg-[length:100%_100%] bg-center bg-no-repeat";
    case "repeat":
      return "bg-repeat bg-top-left bg-auto";
    default:
      return "";
  }
});

async function pickImage(target: "desktop" | "mobile") {
  if (importing.value) return;
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (typeof selected !== "string" || !selected) return;

    importing.value = true;
    // 把图片复制到 app_data_dir/images/imported/：
    // 1. 统一存放，避免 cache 临时路径被 Android 系统清理
    // 2. 规避 Android 上 content:// URI 读不到的问题
    let finalPath = selected;
    try {
      finalPath = await invoke<string>("import_user_image", { src: selected });
    } catch (e) {
      console.warn("import_user_image failed, fallback to raw path:", e);
    }
    store.setImage(finalPath, target);
    showToast("已选择图片");
  } catch (e) {
    showToast("选择图片失败：" + String(e));
  } finally {
    importing.value = false;
  }
}

function selectColor(c: string) {
  store.setColor(c);
}

function selectMode(m: "none" | "image" | "color") {
  store.type = m;
}
</script>

<template>
  <div>
    <AppHeader title="对话背景" show-back />
    <div class="space-y-4 p-3">
      <div class="usage-tip">
        <span class="tip-icon">🎨</span>
        <span>设置对话页面的背景。可选择系统相册图片或纯色，并调整不透明度等效果。</span>
      </div>

      <CellGroup inset title="背景类型">
        <Cell>
          <template #title>
            <div class="flex w-full">
              <button
                v-for="m in [
                  { v: 'none', label: '无' },
                  { v: 'image', label: '图片' },
                  { v: 'color', label: '纯色' },
                ]"
                :key="m.v"
                class="flex flex-1 justify-center py-2 text-sm transition"
                :class="store.type === m.v
                  ? 'font-medium text-brand-500'
                  : 'text-stone-500'"
                @click="selectMode(m.v as 'none' | 'image' | 'color')"
              >
                {{ m.label }}
              </button>
            </div>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup v-if="store.type === 'image'" inset title="图片">
        <Cell title="桌面端图片" is-link @click="pickImage('desktop')">
          <template #value>
            <span v-if="store.imagePathDesktop" class="truncate text-xs text-stone-400" style="max-width: 160px;">
              {{ store.imagePathDesktop }}
            </span>
            <span v-else class="text-xs text-stone-400">未选择</span>
          </template>
        </Cell>
        <Cell title="移动端图片" is-link @click="pickImage('mobile')">
          <template #value>
            <span v-if="store.imagePathMobile" class="truncate text-xs text-stone-400" style="max-width: 160px;">
              {{ store.imagePathMobile }}
            </span>
            <span v-else class="text-xs text-stone-400">未选择</span>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup v-if="store.type === 'color'" inset title="颜色">
        <Cell title="选择颜色" is-link @click="pickerOpen = true">
          <template #value>
            <span
              class="inline-block h-5 w-5 rounded-full ring-1 ring-stone-200"
              :style="{ background: store.color }"
            />
          </template>
        </Cell>
      </CellGroup>

      <CellGroup v-if="store.type === 'image' && previewImageUrl" inset title="尺寸模式">
        <div class="grid grid-cols-2 gap-2 p-2">
          <button
            v-for="m in SIZE_MODES"
            :key="m.value"
            class="flex flex-col items-start rounded-lg border p-3 text-left transition"
            :class="store.sizeMode === m.value
              ? 'border-brand-500 bg-brand-50'
              : 'border-stone-200 bg-white'"
            @click="store.sizeMode = m.value"
          >
            <span
              class="text-sm font-medium"
              :class="store.sizeMode === m.value ? 'text-brand-600' : 'text-stone-700'"
            >
              {{ m.label }}
            </span>
            <span class="mt-0.5 text-[11px] text-stone-400">{{ m.hint }}</span>
          </button>
        </div>
      </CellGroup>

      <CellGroup v-if="store.type !== 'none'" inset title="效果">
        <Cell title="不透明度" :value="`${store.opacity}%`">
          <template #label>
            <div class="w-full">
              <div class="mb-1 text-xs text-stone-500">不透明度 {{ store.opacity }}%</div>
              <Slider v-model="store.opacity" :min="0" :max="100" :step="1" />
            </div>
          </template>
        </Cell>
        <Cell v-if="store.type === 'image'" title="模糊">
          <template #label>
            <div class="w-full">
              <div class="mb-1 text-xs text-stone-500">模糊 {{ store.blur }}px</div>
              <Slider v-model="store.blur" :min="0" :max="20" :step="1" />
            </div>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup inset title="预览">
        <Cell>
          <template #title>
            <div class="w-full">
              <div
                class="relative h-44 w-full overflow-hidden rounded-lg"
                style="background: repeating-linear-gradient(45deg, #f5f5f4, #f5f5f4 10px, #e7e5e4 10px, #e7e5e4 20px);"
              >
                <div
                  v-if="store.type !== 'none'"
                  class="absolute inset-0"
                  :class="previewBgClass"
                  :style="previewStyle"
                />
                <div class="absolute inset-0 flex items-center justify-center p-4">
                  <div
                    class="rounded-2xl bg-white/95 px-3 py-2 text-sm text-stone-700 shadow"
                  >
                    预览效果
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Cell>
      </CellGroup>

      <div class="px-4">
        <Button block round plain type="default" @click="store.reset">
          恢复默认
        </Button>
      </div>
    </div>

    <div v-if="pickerOpen" class="fixed inset-0 z-50 flex items-end" @click.self="pickerOpen = false">
      <div class="w-full rounded-t-2xl bg-white p-4 shadow-lg">
        <div class="mb-3 text-sm font-medium text-stone-700">选择颜色</div>
        <div class="grid grid-cols-8 gap-2">
          <button
            v-for="c in PRESET_COLORS"
            :key="c"
            class="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-stone-200 transition active:scale-95"
            :style="{ background: c }"
            @click="selectColor(c); pickerOpen = false"
          >
            <svg
              v-if="store.color.toLowerCase() === c.toLowerCase()"
              class="h-4 w-4"
              :class="['#fafaf9', '#ffffff'].includes(c.toLowerCase()) ? 'text-stone-700' : 'text-white'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </button>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <input
            v-model="store.color"
            type="color"
            class="h-9 w-12 cursor-pointer rounded border border-stone-200 bg-white"
          />
          <input
            v-model="store.color"
            type="text"
            class="flex-1 rounded border border-stone-200 px-2 py-1 text-sm"
            placeholder="#RRGGBB"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usage-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 4px 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(13, 148, 136, 0.06);
  border: 1px solid rgba(13, 148, 136, 0.18);
  color: #475569;
  font-size: 12.5px;
  line-height: 1.55;
}

.tip-icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.55;
}
</style>
