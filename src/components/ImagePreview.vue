<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  src: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const scale = ref(1);
const x = ref(0);
const y = ref(0);
const dragging = ref(false);
const pointerId = ref<number | null>(null);
const startX = ref(0);
const startY = ref(0);
const startMatrix = ref({ x: 0, y: 0 });

const transform = computed(() => `translate(${x.value}px, ${y.value}px) scale(${scale.value})`);

function reset() {
  scale.value = 1;
  x.value = 0;
  y.value = 0;
}

function close() {
  emit("close");
}

function toggleZoom() {
  if (scale.value > 1) {
    reset();
  } else {
    scale.value = 2.5;
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const next = Math.min(8, Math.max(0.2, scale.value * delta));
  scale.value = next;
  if (next === 1) {
    x.value = 0;
    y.value = 0;
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  dragging.value = true;
  pointerId.value = e.pointerId;
  startX.value = e.clientX;
  startY.value = e.clientY;
  startMatrix.value = { x: x.value, y: y.value };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId.value) return;
  x.value = startMatrix.value.x + (e.clientX - startX.value);
  y.value = startMatrix.value.y + (e.clientY - startY.value);
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId.value) return;
  dragging.value = false;
  pointerId.value = null;
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === "Escape") close();
  else if (e.key === "0") reset();
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      reset();
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[9999] flex select-none items-center justify-center overflow-hidden bg-black/90"
      @click.self="close"
      @wheel="onWheel"
    >
      <img
        :src="src"
        :style="{ transform }"
        class="max-h-full max-w-full cursor-grab will-change-transform"
        :class="{ '!cursor-grabbing': dragging, 'object-contain': scale === 1 }"
        alt="preview"
        draggable="false"
        @click.stop="toggleZoom"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
      <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
        <span>{{ Math.round(scale * 100) }}%</span>
        <button class="px-1.5 hover:text-white" @click.stop="reset">重置</button>
        <button class="px-1.5 hover:text-white" @click.stop="close">关闭</button>
      </div>
      <div class="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/50">
        点击切换缩放 · 滚轮缩放 · 拖动平移 · Esc 关闭
      </div>
    </div>
  </Teleport>
</template>
