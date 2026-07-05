<script setup lang="ts">
import { ref, watch } from "vue";
import { resolveImageUrl } from "@/api/asset";

const props = defineProps<{
  path: string;
  remoteUrl?: string;
  previewable?: boolean;
}>();

const emit = defineEmits<{
  (e: "preview", src: string): void;
}>();

const src = ref("");
const failed = ref(false);
const errorMsg = ref("");

async function load() {
  failed.value = false;
  errorMsg.value = "";
  if (props.remoteUrl) {
    src.value = props.remoteUrl;
    return;
  }
  try {
    const url = await resolveImageUrl(props.path);
    if (url) {
      src.value = url;
    } else {
      failed.value = true;
      errorMsg.value = "解析结果为空";
    }
  } catch (e) {
    failed.value = true;
    errorMsg.value = String(e);
  }
}

function onImgError() {
  failed.value = true;
  if (!errorMsg.value) errorMsg.value = "<img> 加载触发 error 事件";
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
