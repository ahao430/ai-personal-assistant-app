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

async function load() {
  failed.value = false;
  if (props.remoteUrl) {
    src.value = props.remoteUrl;
    return;
  }
  src.value = await resolveImageUrl(props.path);
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
    @error="failed = true"
    @click="onClick"
  />
  <div
    v-else-if="failed"
    class="flex h-32 w-48 items-center justify-center rounded-lg bg-gray-100 px-3 text-center text-xs text-gray-400"
  >
    图片文件暂不可用，请同步后再试
  </div>
  <div v-else class="h-32 w-32 animate-pulse bg-gray-100"></div>
</template>
