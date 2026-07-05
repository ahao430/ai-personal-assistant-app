<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Checkbox, Empty, showConfirmDialog, showToast } from "vant";
import {
  NOTE_COLOR_MAP,
  useNotesStore,
} from "@/stores/notes";
import { useLayoutMode } from "@/composables/useLayoutMode";
import type { NoteRow } from "@/db/repos";

const router = useRouter();
const store = useNotesStore();
const { isDesktop } = useLayoutMode();

type ViewMode = "card" | "list";
const viewMode = ref<ViewMode>("card");
const selectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

const showActionFor = ref<string | null>(null);
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let pointerStart: { x: number; y: number } | null = null;

onMounted(() => store.reload());
onUnmounted(() => {
  if (longPressTimer) clearTimeout(longPressTimer);
});

function previewText(n: NoteRow): string {
  const text = n.content?.replace(/[#*`>\-\[\]()!]/g, "").trim();
  if (!text) return "（空笔记）";
  return text.slice(0, 60);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function colorDot(key: string): string {
  return NOTE_COLOR_MAP[key]?.dot ?? NOTE_COLOR_MAP[""].dot;
}

function openNew() {
  router.push("/notes/new");
}

function openEdit(n: NoteRow) {
  if (selectionMode.value) {
    toggleSelect(n.id);
    return;
  }
  router.push(`/notes/${n.id}`);
}

function enterSelection(id: string) {
  selectionMode.value = true;
  selectedIds.value = new Set([id]);
  showActionFor.value = null;
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function exitSelection() {
  selectionMode.value = false;
  selectedIds.value = new Set();
}

async function deleteSelected() {
  if (!selectedIds.value.size) return;
  try {
    await showConfirmDialog({
      title: "删除笔记",
      message: `确定删除 ${selectedIds.value.size} 篇笔记？`,
    });
    await store.removeMany([...selectedIds.value]);
    showToast("已删除");
    exitSelection();
  } catch {
    // cancel
  }
}

async function deleteOne(n: NoteRow) {
  showActionFor.value = null;
  try {
    await showConfirmDialog({
      title: "删除笔记",
      message: `确定删除「${n.title || previewText(n).slice(0, 20)}」？`,
    });
    await store.remove(n.id);
    showToast("已删除");
  } catch {
    // cancel
  }
}

function onPointerDown(e: PointerEvent, n: NoteRow) {
  if (selectionMode.value) return;
  pointerStart = { x: e.clientX, y: e.clientY };
  longPressTimer = setTimeout(() => {
    enterSelection(n.id);
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

function onContextmenu(e: MouseEvent, n: NoteRow) {
  if (selectionMode.value) return;
  e.preventDefault();
  showActionFor.value = n.id;
}

const isEmpty = computed(() => !store.loading && store.items.length === 0);
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="笔记" :show-back="!isDesktop" show-sync />

    <!-- 操作行：视图切换 / 新建 / 多选删除（避免遮挡 tabbar） -->
    <div
      class="flex items-center gap-2 border-b border-stone-100 bg-stone-50 px-3 py-2"
    >
      <div class="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md transition"
          :class="viewMode === 'card' ? 'bg-white text-brand-600 shadow-sm' : 'text-stone-400'"
          @click="viewMode = 'card'"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md transition"
          :class="viewMode === 'list' ? 'bg-white text-brand-600 shadow-sm' : 'text-stone-400'"
          @click="viewMode = 'list'"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div class="flex-1"></div>

      <template v-if="selectionMode">
        <span class="text-xs text-stone-500">已选 {{ selectedIds.size }} 篇</span>
        <button
          class="flex h-8 items-center justify-center rounded-full bg-red-50 px-4 text-xs font-medium text-red-600 transition active:scale-95 disabled:opacity-40"
          :disabled="!selectedIds.size"
          @click="deleteSelected"
        >
          删除
        </button>
        <button
          class="flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-stone-500 transition"
          @click="exitSelection"
        >
          取消
        </button>
      </template>
      <button
        v-else
        class="flex h-8 items-center justify-center gap-1 rounded-full bg-brand-600 px-4 text-xs font-medium text-white transition active:scale-95"
        @click="openNew"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>新建</span>
      </button>
    </div>

    <div class="p-3">
      <Empty v-if="isEmpty" description="还没有笔记" />

      <!-- 卡片视图 -->
      <div
        v-else-if="viewMode === 'card'"
        class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      >
        <div
          v-for="n in store.items"
          :key="n.id"
          class="group relative cursor-pointer rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100 transition active:scale-[0.98]"
          @click="openEdit(n)"
          @contextmenu="onContextmenu($event, n)"
          @pointerdown="onPointerDown($event, n)"
          @pointermove="onPointerMove($event)"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
        >
          <div
            class="absolute left-0 top-4 bottom-4 w-1 rounded-full"
            :style="{ background: colorDot(n.color) }"
          ></div>
          <div v-if="selectionMode" class="absolute right-3 top-3">
            <Checkbox :model-value="selectedIds.has(n.id)" shape="square" />
          </div>
          <div class="mb-1.5 truncate pl-2 text-sm font-semibold text-stone-800">
            {{ n.title || "无标题" }}
          </div>
          <div class="line-clamp-4 pl-2 text-xs leading-relaxed text-stone-500">
            {{ previewText(n) }}
          </div>
          <div class="mt-3 pl-2 text-[11px] text-stone-400">
            {{ fmtDate(n.updated_at) }}
          </div>

          <!-- 右键菜单（桌面端） -->
          <div
            v-if="showActionFor === n.id"
            class="absolute right-2 top-2 z-20 rounded-lg bg-white py-1 shadow-lg ring-1 ring-stone-100"
            @click.stop
          >
            <button
              class="block w-full px-4 py-1.5 text-left text-xs text-stone-600 hover:bg-stone-50"
              @click="enterSelection(n.id)"
            >
              多选
            </button>
            <button
              class="block w-full px-4 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
              @click="deleteOne(n)"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <!-- 列表视图 -->
      <ul v-else class="space-y-1.5">
        <li
          v-for="n in store.items"
          :key="n.id"
          class="group relative flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 shadow-card ring-1 ring-stone-100 transition active:bg-stone-50"
          @click="openEdit(n)"
          @contextmenu="onContextmenu($event, n)"
          @pointerdown="onPointerDown($event, n)"
          @pointermove="onPointerMove($event)"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
        >
          <span
            class="h-8 w-1 flex-shrink-0 rounded-full"
            :style="{ background: colorDot(n.color) }"
          ></span>
          <div v-if="selectionMode" class="flex-shrink-0">
            <Checkbox :model-value="selectedIds.has(n.id)" shape="square" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-stone-800">
              {{ n.title || "无标题" }}
            </div>
            <div class="truncate text-xs text-stone-500">
              {{ previewText(n) }}
            </div>
          </div>
          <span class="flex-shrink-0 text-[11px] text-stone-400">
            {{ fmtDate(n.updated_at) }}
          </span>

          <div
            v-if="showActionFor === n.id"
            class="absolute right-2 top-full z-20 mt-1 rounded-lg bg-white py-1 shadow-lg ring-1 ring-stone-100"
            @click.stop
          >
            <button
              class="block w-full px-4 py-1.5 text-left text-xs text-stone-600 hover:bg-stone-50"
              @click="enterSelection(n.id)"
            >
              多选
            </button>
            <button
              class="block w-full px-4 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
              @click="deleteOne(n)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
    </div>

    <!-- 桌面端点击空白关闭右键菜单 -->
    <div
      v-if="showActionFor"
      class="fixed inset-0 z-10"
      @click="showActionFor = null"
    />
  </div>
</template>
