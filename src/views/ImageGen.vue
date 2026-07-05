<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import { showToast } from "vant";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import { imageEdit, imageGen, optimizeImagePrompt, type ImageConfig, type ImageGenResult } from "@/api/image";
import { useImageConfigStore } from "@/stores/image-config";
import { useLlmConfigStore } from "@/stores/llm-config";
import { useLayoutMode } from "@/composables/useLayoutMode";
import { getAppDataDir } from "@/api/asset";
import Inputs from "@/components/ImageGen/Inputs.vue";
import Results from "@/components/ImageGen/Results.vue";

const imgStore = useImageConfigStore();
const llmStore = useLlmConfigStore();
const { isDesktop } = useLayoutMode();

const STORAGE_KEY = "image-gen-session-v1";

const selectedConfigId = ref<string | null>(null);
const idea = ref("");
const prompt = ref("");
const showOptions = ref(false);
const count = ref(1);
const quality = ref<string>("standard");
const aspect = ref<string>("1:1");
const refImagePath = ref<string>("");
const refImageAbs = ref<string>("");
const generating = ref(false);
const optimizing = ref(false);
const results = ref<ImageGenResult[]>([]);

const previewVisible = ref(false);
const previewSrcs = ref<string[]>([]);
const previewStart = ref(0);

const mobileFileInput = ref<HTMLInputElement | null>(null);

const ASPECTS: { key: string; size: string }[] = [
  { key: "1:1", size: "1024x1024" },
  { key: "4:3", size: "1024x768" },
  { key: "3:4", size: "768x1024" },
  { key: "16:9", size: "1792x1024" },
  { key: "9:16", size: "1024x1792" },
  { key: "3:2", size: "1536x1024" },
  { key: "2:3", size: "1024x1536" },
];

const selectedConfig = computed<ImageConfig | undefined>(() =>
  imgStore.configs.find((c) => c.id === selectedConfigId.value) ?? imgStore.defaultConfig
);

const selectedSize = computed(() => {
  return ASPECTS.find((a) => a.key === aspect.value)?.size ?? "1024x1024";
});

onMounted(async () => {
  await imgStore.reload();
  await llmStore.reload();
  loadSession();
  if (!selectedConfigId.value) {
    selectedConfigId.value = imgStore.defaultConfig?.id ?? null;
  }
});

// 持久化输入和结果到 localStorage（结果只本地，不同步）
watch(
  [selectedConfigId, idea, prompt, showOptions, count, quality, aspect, refImagePath, results],
  () => saveSession(),
  { deep: true }
);

function saveSession() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedConfigId: selectedConfigId.value,
        idea: idea.value,
        prompt: prompt.value,
        showOptions: showOptions.value,
        count: count.value,
        quality: quality.value,
        aspect: aspect.value,
        refImagePath: refImagePath.value,
        results: results.value,
      })
    );
  } catch { /* ignore */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.selectedConfigId) selectedConfigId.value = s.selectedConfigId;
    if (typeof s.idea === "string") idea.value = s.idea;
    if (typeof s.prompt === "string") prompt.value = s.prompt;
    if (typeof s.showOptions === "boolean") showOptions.value = s.showOptions;
    if (typeof s.count === "number") count.value = s.count;
    if (typeof s.quality === "string") quality.value = s.quality;
    if (typeof s.aspect === "string") aspect.value = s.aspect;
    if (Array.isArray(s.results)) results.value = s.results;
    if (typeof s.refImagePath === "string" && s.refImagePath) {
      refImagePath.value = s.refImagePath;
      getAppDataDir().then((base) => {
        refImageAbs.value = `${base}/images/${s.refImagePath}`;
      });
    }
  } catch { /* ignore */ }
}

async function optimize() {
  const ideaTrim = idea.value.trim();
  if (!ideaTrim) {
    showToast("请先输入你的想法");
    return;
  }
  if (!llmStore.defaultConfig) {
    showToast("请先配置大模型");
    return;
  }
  optimizing.value = true;
  try {
    const result = await optimizeImagePrompt(ideaTrim, llmStore.toApi(llmStore.defaultConfig));
    prompt.value = result;
    showToast("提示词已优化");
  } catch (e) {
    showToast("优化失败：" + String(e));
  } finally {
    optimizing.value = false;
  }
}

async function pickRefImage() {
  if (isDesktop.value) {
    await pickRefImageDesktop();
  } else {
    mobileFileInput.value?.click();
  }
}

async function pickRefImageDesktop() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
    });
    if (typeof selected !== "string" || !selected) return;
    const relPath = await invoke<string>("import_user_image", { src: selected });
    await setRefImage(relPath);
    showToast("已选择参考图");
  } catch (e) {
    showToast("选择失败：" + String(e));
  }
}

async function onMobileFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const dataUrl = await readAsDataUrl(file);
    const relPath = await invoke<string>("save_image_data_url", {
      dataUrl,
      subDir: "imported",
    });
    await setRefImage(relPath);
    showToast("已选择参考图");
  } catch (err) {
    showToast("选择失败：" + String(err));
  }
}

async function setRefImage(relPath: string) {
  refImagePath.value = relPath;
  const base = await getAppDataDir();
  refImageAbs.value = `${base}/images/${relPath}`;
}

function clearRef() {
  refImagePath.value = "";
  refImageAbs.value = "";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}

async function generate() {
  if (!selectedConfig.value) {
    showToast("请先配置画图模型");
    return;
  }
  const finalPrompt = prompt.value.trim() || idea.value.trim();
  if (!finalPrompt) {
    showToast("请输入提示词或想法");
    return;
  }
  generating.value = true;
  try {
    const cfg = selectedConfig.value;
    let r: ImageGenResult[];
    if (refImageAbs.value) {
      r = await imageEdit({
        prompt: finalPrompt,
        config: cfg,
        imagePath: refImageAbs.value,
        size: selectedSize.value,
        n: count.value,
      });
    } else {
      r = await imageGen({
        prompt: finalPrompt,
        config: cfg,
        size: selectedSize.value,
        quality: quality.value,
        n: count.value,
      });
    }
    results.value = [...r, ...results.value];
    showToast(`已生成 ${r.length} 张`);
  } catch (e) {
    showToast("生成失败：" + String(e));
  } finally {
    generating.value = false;
  }
}

function onPreview(src: string, srcs: string[]) {
  const idx = Math.max(0, srcs.indexOf(src));
  previewSrcs.value = srcs;
  previewStart.value = idx;
  previewVisible.value = true;
}

async function onSaveImage(src: string) {
  try {
    const bytes = await fetchBytesForSave(src);
    if (!bytes) {
      showToast("无法读取图片");
      return;
    }
    if (isDesktop.value) {
      const dest = await saveDialog({
        defaultPath: `image_${Date.now()}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!dest) return;
      await writeFile(dest, bytes);
      showToast("已保存");
    } else {
      // 移动端：直接保存到 app_data/export，并提示路径
      const base = await getAppDataDir();
      const fname = `export_${Date.now()}.png`;
      const dest = `${base}/images/export/${fname}`;
      await invoke<string>("save_image_data_url", {
        dataUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
        subDir: "export",
      });
      showToast(`已保存到 ${dest}`);
    }
  } catch (e) {
    showToast("保存失败：" + String(e));
  }
}

async function fetchBytesForSave(src: string): Promise<Uint8Array | null> {
  if (src.startsWith("data:")) {
    const b64 = src.split(",")[1] ?? "";
    return base64ToBytes(b64);
  }
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const res = await fetch(src);
    return new Uint8Array(await res.arrayBuffer());
  }
  // asset:// or http://asset.localhost — use Rust fetch_as_data_url
  const dataUrl = await invoke<string | null>("fetch_as_data_url", { url: src });
  if (!dataUrl) return null;
  const b64 = dataUrl.split(",")[1] ?? "";
  return base64ToBytes(b64);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="画图" :show-back="!isDesktop" show-sync />

    <!-- 桌面端：左右双栏 -->
    <div v-if="isDesktop" class="mx-auto flex max-w-6xl gap-4 p-4">
      <div class="w-[480px] flex-shrink-0">
        <Inputs
          :selected-config-id="selectedConfigId"
          :idea="idea"
          :prompt="prompt"
          :show-options="showOptions"
          :count="count"
          :quality="quality"
          :aspect="aspect"
          :ref-image-path="refImagePath"
          :optimizing="optimizing"
          :generating="generating"
          :configs="imgStore.configs"
          @update:selected-config-id="selectedConfigId = $event"
          @update:idea="idea = $event"
          @update:prompt="prompt = $event"
          @update:show-options="showOptions = $event"
          @update:count="count = $event"
          @update:quality="quality = $event"
          @update:aspect="aspect = $event"
          @optimize="optimize"
          @pick-ref="pickRefImage"
          @clear-ref="clearRef"
          @generate="generate"
        />
      </div>
      <div class="flex-1">
        <Results :results="results" @preview="onPreview" />
      </div>
    </div>

    <!-- 移动端：单栏 -->
    <div v-else class="space-y-3 p-3">
      <Inputs
        :selected-config-id="selectedConfigId"
        :idea="idea"
        :prompt="prompt"
        :show-options="showOptions"
        :count="count"
        :quality="quality"
        :aspect="aspect"
        :ref-image-path="refImagePath"
        :optimizing="optimizing"
        :generating="generating"
        :configs="imgStore.configs"
        @update:selected-config-id="selectedConfigId = $event"
        @update:idea="idea = $event"
        @update:prompt="prompt = $event"
        @update:show-options="showOptions = $event"
        @update:count="count = $event"
        @update:quality="quality = $event"
        @update:aspect="aspect = $event"
        @optimize="optimize"
        @pick-ref="pickRefImage"
        @clear-ref="clearRef"
        @generate="generate"
      />
      <Results :results="results" @preview="onPreview" />

      <input
        ref="mobileFileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onMobileFileChange"
      />
    </div>

    <input
      v-if="isDesktop"
      ref="mobileFileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onMobileFileChange"
    />

    <ImagePreview
      :src="previewSrcs.length ? previewSrcs[previewStart] : ''"
      :sources="previewSrcs"
      :start-index="previewStart"
      :visible="previewVisible"
      show-save
      @close="previewVisible = false"
      @save="onSaveImage"
    />
  </div>
</template>
