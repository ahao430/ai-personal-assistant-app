<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";
import { Button, Popup, showToast } from "vant";
import {
  NOTE_COLORS,
  NOTE_FONTS,
  NOTE_PAPERS,
  fontClass,
  paperStyle,
  useNotesStore,
} from "@/stores/notes";
import { useLayoutMode } from "@/composables/useLayoutMode";
import type { NoteRow } from "@/db/repos";

const route = useRoute();
const router = useRouter();
const store = useNotesStore();
const { isDesktop } = useLayoutMode();

const isNew = computed(() => route.params.id === "new");
const noteId = computed(() => (isNew.value ? undefined : (route.params.id as string)));

const title = ref("");
const content = ref("");
const color = ref("");
const font = ref("");
const paper = ref("");
const showStylePopup = ref(false);
const previewMode = ref(false);
const loaded = ref(false);

onMounted(async () => {
  await store.reload();
  if (noteId.value) {
    const n = store.items.find((x) => x.id === noteId.value);
    if (n) {
      title.value = n.title;
      content.value = n.content;
      color.value = n.color;
      font.value = n.font;
      paper.value = n.paper;
    }
  }
  loaded.value = true;
});

watch(
  () => route.params.id,
  async () => {
    if (route.params.id === "new") {
      title.value = "";
      content.value = "";
      color.value = "";
      font.value = "";
      paper.value = "";
      previewMode.value = false;
    } else if (route.params.id) {
      const n = store.items.find((x) => x.id === route.params.id);
      if (n) {
        title.value = n.title;
        content.value = n.content;
        color.value = n.color;
        font.value = n.font;
        paper.value = n.paper;
      }
    }
  }
);

const textareaStyle = computed(() => {
  const base = paperStyle(paper.value);
  return {
    ...base,
    fontFamily: fontFamilyCss(font.value),
  } as Record<string, string>;
});

function fontFamilyCss(f: string): string {
  switch (f) {
    case "songti": return '"Songti SC", "SimSun", "Noto Serif CJK SC", serif';
    case "kaiti": return '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif';
    case "mono": return '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
    default: return 'inherit';
  }
}

const isDark = computed(() => paper.value === "dark");

async function save() {
  if (!title.value.trim() && !content.value.trim()) {
    router.back();
    return;
  }
  const row: Partial<NoteRow> & { title: string } = {
    title: title.value.trim() || "无标题",
    content: content.value,
    color: color.value,
    font: font.value,
    paper: paper.value,
  };
  if (noteId.value) row.id = noteId.value;
  await store.save(row);
  showToast("已保存");
  router.back();
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-stone-50">
    <AppHeader :title="isNew ? '新建笔记' : '编辑笔记'" :show-back="!isDesktop" show-sync>
      <template #right>
        <div class="flex items-center gap-1 pr-1">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg transition"
            :class="previewMode ? 'bg-brand-50 text-brand-600' : 'text-stone-400'"
            @click="previewMode = !previewMode"
            :title="previewMode ? '切换到编辑' : '切换到预览'"
          >
            <svg v-if="previewMode" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition"
            @click="showStylePopup = true"
            title="样式"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.7 0 1.5-.5 1.5-1.4 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5-4.5-9-10-9z" />
            </svg>
          </button>
          <Button size="small" type="primary" @click="save">保存</Button>
        </div>
      </template>
    </AppHeader>

    <div v-if="loaded" class="mx-auto flex w-full max-w-3xl flex-1 flex-col p-3">
      <input
        v-model="title"
        type="text"
        placeholder="标题"
        class="mb-2 w-full rounded-2xl bg-white px-4 py-3 text-base font-semibold text-stone-800 shadow-card ring-1 ring-stone-100 focus:outline-none"
      />

      <!-- 编辑模式 -->
      <textarea
        v-if="!previewMode"
        v-model="content"
        placeholder="开始写点什么…"
        class="flex-1 min-h-[400px] w-full resize-none rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card ring-1 ring-stone-100 focus:outline-none"
        :style="textareaStyle"
        :class="[fontClass(font), isDark ? 'placeholder-stone-400' : 'placeholder-stone-300']"
      ></textarea>

      <!-- 预览模式 -->
      <div
        v-else
        class="flex-1 min-h-[400px] w-full overflow-auto rounded-2xl px-4 py-3 shadow-card ring-1 ring-stone-100"
        :style="textareaStyle"
        :class="fontClass(font)"
      >
        <MarkdownRenderer v-if="content" :content="content" />
        <p v-else class="text-sm text-stone-400">（空）</p>
      </div>
    </div>

    <!-- 样式选择 -->
    <Popup v-model:show="showStylePopup" position="bottom" round teleport="body">
      <div class="p-4">
        <h3 class="mb-3 text-sm font-semibold text-stone-800">卡片颜色</h3>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="c in NOTE_COLORS"
            :key="c.key"
            class="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition"
            :class="color === c.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'"
            @click="color = c.key"
          >
            <span class="h-3 w-3 rounded-full" :style="{ background: c.dot }"></span>
            {{ c.label }}
          </button>
        </div>

        <h3 class="mb-3 text-sm font-semibold text-stone-800">字体</h3>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="f in NOTE_FONTS"
            :key="f.key"
            class="rounded-full px-3 py-1.5 text-xs transition"
            :class="font === f.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'"
            @click="font = f.key"
          >
            {{ f.label }}
          </button>
        </div>

        <h3 class="mb-3 text-sm font-semibold text-stone-800">纸张</h3>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            v-for="p in NOTE_PAPERS"
            :key="p.key"
            class="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition"
            :class="paper === p.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'"
            @click="paper = p.key"
          >
            <span class="h-3 w-3 rounded border border-stone-200" :style="{ background: p.bg }"></span>
            {{ p.label }}
          </button>
        </div>
      </div>
    </Popup>
  </div>
</template>
