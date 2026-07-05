<script setup lang="ts">
import { ref, watch } from "vue";
import { getAppDataDir, resolveImageUrl } from "@/api/asset";
import { invoke } from "@tauri-apps/api/core";

const props = defineProps<{
  path: string;
  remoteUrl?: string;
  previewable?: boolean;
}>();

const emit = defineEmits<{
  (e: "preview", src: string): void;
  (e: "loaded", src: string): void;
}>();

const src = ref("");
const failed = ref(false);
const errorMsg = ref("");
let retried = false;

async function load() {
  failed.value = false;
  errorMsg.value = "";
  retried = false;
  if (props.remoteUrl) {
    src.value = props.remoteUrl;
    emit("loaded", src.value);
    return;
  }
  try {
    const url = await resolveImageUrl(props.path);
    if (url) {
      src.value = url;
      emit("loaded", src.value);
    } else {
      failed.value = true;
      errorMsg.value = "解析结果为空";
    }
  } catch (e) {
    failed.value = true;
    errorMsg.value = String(e);
  }
}

async function onImgError() {
  // 如果当前 src 不是 data URL，降级为 fetch_as_data_url 重试一次
  if (!retried && src.value && !src.value.startsWith("data:")) {
    retried = true;
    try {
      const base = await getAppDataDir();
      const abs = `${base}/images/${props.path}`;
      const dataUrl = await invoke<string | null>("fetch_as_data_url", { url: abs });
      if (dataUrl) {
        src.value = dataUrl;
        failed.value = false;
        errorMsg.value = "";
        emit("loaded", src.value);
        return;
      }
    } catch { /* fall through to error display */ }
  }
  failed.value = true;
  if (!errorMsg.value) {
    const srcPreview = src.value
      ? src.value.length > 120
        ? src.value.slice(0, 80) + "..." + src.value.slice(-30)
        : src.value
      : "(空)";
    errorMsg.value = `<img> error | src: ${srcPreview}`;
  }
}

function onClick() {
  if (props.previewable && src.value) {
    emit("preview", src.value);
  }
}

watch(() => props.path, load, { immediate: true });
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    class="block max-h-72 w-auto max-w-full"
    :class="previewable ? 'cursor-zoom-in' : ''"
    alt="generated"
    @error="onImgError"
    @click="onClick"
  />
  <div
    v-else-if="failed"
    class="flex h-32 w-72 flex-col items-center justify-center rounded-lg bg-gray-100 px-3 text-center text-xs text-gray-400"
  >
    <span>图片加载失败</span>
    <span class="mt-1 break-all text-[10px] leading-tight text-gray-400">{{ props.path }}</span>
    <span v-if="errorMsg" class="mt-1 break-all text-[10px] leading-tight text-red-400">{{ errorMsg }}</span>
  </div>
  <div v-else class="h-32 w-32 animate-pulse bg-gray-100"></div>
</template>
