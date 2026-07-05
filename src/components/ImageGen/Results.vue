<script setup lang="ts">
import { PropType, ref } from "vue";
import { Checkbox, showConfirmDialog } from "vant";
import AsyncImage from "@/components/AsyncImage.vue";
import type { ImageGenResult } from "@/api/image";

const props = defineProps({
  results: { type: Array as PropType<ImageGenResult[]>, default: () => [] },
});

const emit = defineEmits<{
  (e: "preview", src: string, srcs: string[]): void;
  (e: "delete", items: ImageGenResult[]): void;
}>();

// 跟踪每张图的最终 src（data URL / asset URL），用于多图切换
const srcMap = ref<Record<string, string>>({});
const selectionMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());

let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let pointerStart: { x: number; y: number } | null = null;

function onLoaded(r: ImageGenResult, src: string) {
  srcMap.value[r.path] = src;
}

function onClick(r: ImageGenResult) {
  if (selectionMode.value) {
    toggleSelect(r.path);
    return;
  }
  const src = srcMap.value[r.path];
  if (!src) return;
  const ordered = props.results
    .map((x) => srcMap.value[x.path])
    .filter((s): s is string => !!s);
  emit("preview", src, ordered);
}

function enterSelection(path: string) {
  selectionMode.value = true;
  selectedPaths.value = new Set([path]);
}

function toggleSelect(path: string) {
  const next = new Set(selectedPaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  selectedPaths.value = next;
}

function exitSelection() {
  selectionMode.value = false;
  selectedPaths.value = new Set();
}

async function deleteSelected() {
  if (!selectedPaths.value.size) return;
  try {
    await showConfirmDialog({
      title: "删除图片",
      message: `确定删除 ${selectedPaths.value.size} 张？`,
    });
    const items = props.results.filter((r) => selectedPaths.value.has(r.path));
    emit("delete", items);
    exitSelection();
  } catch {
    // cancel
  }
}

function onPointerDown(e: PointerEvent, r: ImageGenResult) {
  if (selectionMode.value) return;
  pointerStart = { x: e.clientX, y: e.clientY };
  longPressTimer = setTimeout(() => {
    enterSelection(r.path);
    pointerStart = null;
  }, 500);
}

function onPointerMove(e: PointerEvent) {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) > 10 && longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}

function onPointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
  pointerStart = null;
}

function onContextmenu(e: MouseEvent, r: ImageGenResult) {
  if (selectionMode.value) return;
  e.preventDefault();
  enterSelection(r.path);
}
</script>

<template>
  <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-stone-500">
        生成结果（{{ results.length }}）
      </span>
      <template v-if="selectionMode">
        <span class="text-xs text-stone-500">已选 {{ selectedPaths.size }} 张</span>
        <button
          class="ml-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition active:scale-95 disabled:opacity-40"
          :disabled="!selectedPaths.size"
          @click="deleteSelected"
        >
          删除
        </button>
        <button
          class="ml-1 rounded-full px-2 py-1 text-xs font-medium text-stone-500"
          @click="exitSelection"
        >
          取消
        </button>
      </template>
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
        class="relative overflow-hidden rounded-lg bg-stone-50"
        :class="selectionMode && selectedPaths.has(r.path) ? 'ring-2 ring-brand-500' : ''"
        @contextmenu="onContextmenu($event, r)"
        @pointerdown="onPointerDown($event, r)"
        @pointermove="onPointerMove($event)"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      >
        <AsyncImage
          :path="r.path"
          :remote-url="r.remoteUrl"
          class="!max-h-[420px] mx-auto"
          :previewable="!selectionMode"
          @loaded="(s) => onLoaded(r, s)"
          @preview="onClick(r)"
        />
        <div v-if="selectionMode" class="absolute right-2 top-2">
          <Checkbox :model-value="selectedPaths.has(r.path)" shape="square" />
        </div>
      </div>
    </div>
  </div>
</template>
