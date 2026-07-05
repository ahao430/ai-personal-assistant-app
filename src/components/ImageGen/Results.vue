<script setup lang="ts">
import { PropType, ref } from "vue";
import AsyncImage from "@/components/AsyncImage.vue";
import type { ImageGenResult } from "@/api/image";

const props = defineProps({
  results: { type: Array as PropType<ImageGenResult[]>, default: () => [] },
});

const emit = defineEmits<{
  (e: "preview", src: string, srcs: string[]): void;
}>();

// 跟踪每张图的最终 src（data URL / asset URL），用于多图切换
const srcMap = ref<Record<string, string>>({});

function onLoaded(r: ImageGenResult, src: string) {
  srcMap.value[r.path] = src;
}

function onClick(r: ImageGenResult) {
  const src = srcMap.value[r.path];
  if (!src) return;
  const ordered = props.results
    .map((x) => srcMap.value[x.path])
    .filter((s): s is string => !!s);
  emit("preview", src, ordered);
}
</script>

<template>
  <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
    <div class="mb-2 text-xs font-medium text-stone-500">
      生成结果（{{ results.length }}）
    </div>
    <div
      v-if="results.length === 0"
      class="flex h-40 items-center justify-center rounded-lg bg-stone-50 text-xs text-stone-400"
    >
      还没有生成结果
    </div>
    <div v-else class="grid grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="(r, i) in results"
        :key="r.path + i"
        class="overflow-hidden rounded-lg bg-stone-50"
      >
        <AsyncImage
          :path="r.path"
          :remote-url="r.remoteUrl"
          class="!max-h-[420px] mx-auto"
          previewable
          @loaded="(s) => onLoaded(r, s)"
          @preview="onClick(r)"
        />
      </div>
    </div>
  </div>
</template>
