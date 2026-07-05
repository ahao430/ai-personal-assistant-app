<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  src: string;
  /** 可选：多图导航。传入后显示左右切换箭头 */
  sources?: string[];
  /** 可选：当前起始索引（仅当 sources 非空时生效） */
  startIndex?: number;
  visible: boolean;
  /** 可选：显示"保存到本地"按钮 */
  showSave?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", src: string): void;
}>();

const scale = ref(1);
const x = ref(0);
const y = ref(0);
const currentIndex = ref(0);

const hasMulti = computed(() => (props.sources?.length ?? 0) > 1);
const currentSrc = computed(() => {
  if (props.sources && props.sources.length > 0) {
    return props.sources[currentIndex.value] ?? props.src;
  }
  return props.src;
});

// 多指状态：1 指 = 单指拖拽；2 指 = pinch 缩放 + 双指中点平移
const pointers = new Map<number, { x: number; y: number }>();
const dragStart = ref<{ x: number; y: number; ox: number; oy: number } | null>(null);
const pinchStart = ref<{
  dist: number;
  scale: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
} | null>(null);

const transform = computed(
  () => `translate(${x.value}px, ${y.value}px) scale(${scale.value})`
);

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
  if (e.pointerType === "mouse" && e.button !== 0) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    dragStart.value = { x: e.clientX, y: e.clientY, ox: x.value, oy: y.value };
  } else if (pointers.size === 2) {
    dragStart.value = null;
    const [a, b] = [...pointers.values()];
    pinchStart.value = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      scale: scale.value,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      ox: x.value,
      oy: y.value,
    };
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1 && dragStart.value) {
    x.value = dragStart.value.ox + (e.clientX - dragStart.value.x);
    y.value = dragStart.value.oy + (e.clientY - dragStart.value.y);
  } else if (pointers.size === 2 && pinchStart.value) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ratio = dist / pinchStart.value.dist;
    scale.value = Math.min(8, Math.max(0.2, pinchStart.value.scale * ratio));
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    x.value = pinchStart.value.ox + (cx - pinchStart.value.cx);
    y.value = pinchStart.value.oy + (cy - pinchStart.value.cy);
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart.value = null;
  if (pointers.size === 1) {
    // 从 2 指变 1 指：用剩余指的当前位置作为新拖拽起点，避免位置跳变
    const [pt] = [...pointers.values()];
    dragStart.value = { x: pt.x, y: pt.y, ox: x.value, oy: y.value };
  } else if (pointers.size === 0) {
    dragStart.value = null;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === "Escape") close();
  else if (e.key === "0") reset();
  else if (e.key === "ArrowLeft") prev();
  else if (e.key === "ArrowRight") next();
}

function prev() {
  if (!hasMulti.value) return;
  reset();
  currentIndex.value =
    (currentIndex.value - 1 + props.sources!.length) % props.sources!.length;
}

function next() {
  if (!hasMulti.value) return;
  reset();
  currentIndex.value = (currentIndex.value + 1) % props.sources!.length;
}

function save() {
  if (currentSrc.value) emit("save", currentSrc.value);
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      reset();
      pointers.clear();
      dragStart.value = null;
      pinchStart.value = null;
      currentIndex.value = Math.max(0, Math.min(props.startIndex ?? 0, (props.sources?.length ?? 1) - 1));
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

watch(currentSrc, () => reset());

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
        :src="currentSrc"
        :style="{ transform }"
        class="max-h-full max-w-full touch-none cursor-grab will-change-transform"
        :class="{ 'object-contain': scale === 1 }"
        alt="preview"
        draggable="false"
        @click.stop="toggleZoom"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
      <!-- 左右切换 -->
      <button
        v-if="hasMulti"
        class="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition active:bg-white/20"
        @click.stop="prev"
        aria-label="上一张"
      >
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <button
        v-if="hasMulti"
        class="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur transition active:bg-white/20"
        @click.stop="next"
        aria-label="下一张"
      >
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
        <span v-if="hasMulti">{{ currentIndex + 1 }} / {{ sources?.length }}</span>
        <span>{{ Math.round(scale * 100) }}%</span>
        <button v-if="showSave" class="px-1.5 hover:text-white" @click.stop="save">保存</button>
        <button class="px-1.5 hover:text-white" @click.stop="reset">重置</button>
        <button class="px-1.5 hover:text-white" @click.stop="close">关闭</button>
      </div>
      <div class="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/50">
        点击切换缩放 · 双指捏合 · 滚轮缩放 · 拖动平移 · Esc 关闭
      </div>
    </div>
  </Teleport>
</template>
