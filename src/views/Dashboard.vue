<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Cell, CellGroup, Empty, Tag } from "vant";
import { useTodoStore } from "@/stores/todo";
import { useEventStore } from "@/stores/event";
import { listTodos } from "@/db/repos";
import { getDb } from "@/db";
import { useLayoutMode } from "@/composables/useLayoutMode";

const router = useRouter();
const todoStore = useTodoStore();
const eventStore = useEventStore();

const today = new Date();
const greeting = computed(() => {
  const h = today.getHours();
  if (h < 6) return "深夜好";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  if (h < 22) return "晚上好";
  return "夜深了";
});

const todayEvents = ref<any[]>([]);
const todayPendingTodos = ref<Awaited<ReturnType<typeof listTodos>>>([]);
const yesterdayReport = ref<{ date: string; summary: string } | null>(null);

const todayLabel = today.toLocaleDateString("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

onMounted(async () => {
  await Promise.all([
    todoStore.reload(),
    eventStore.loadMonth(today.getFullYear(), today.getMonth() + 1),
  ]);

  const dayStart = new Date(today).setHours(0, 0, 0, 0);
  const dayEnd = new Date(today).setHours(23, 59, 59, 999);
  todayEvents.value = eventStore.items.filter(
    (e) => e.start_at >= dayStart && e.start_at <= dayEnd
  );

  const all = await listTodos({ status: "all" });
  todayPendingTodos.value = all.filter(
    (t) =>
      t.status === "pending" &&
      (t.due_at == null || (t.due_at >= dayStart && t.due_at <= dayEnd))
  );

  try {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const ykey = y.toISOString().slice(0, 10);
    const db = await getDb();
    const rows = await db.select<{ date: string; summary: string }[]>(
      "SELECT date, summary FROM daily_reports WHERE date = $1",
      [ykey]
    );
    yesterdayReport.value = rows[0] ?? null;
  } catch {
    // ignore
  }
});

function go(path: string) {
  router.push(path);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

const { isDesktop } = useLayoutMode();

const quickEntries = computed(() => {
  if (isDesktop.value) {
    return [
      { key: "chat", label: "对话", path: "/chat", tint: "brand" },
      { key: "tasks", label: "任务", path: "/tasks", tint: "accent" },
      { key: "calendar", label: "日程", path: "/calendar", tint: "brand" },
      { key: "settings", label: "设置", path: "/settings", tint: "accent" },
    ];
  }
  return [
    { key: "calendar", label: "日程", path: "/calendar", tint: "brand" },
    { key: "tasks", label: "待办", path: "/tasks", tint: "accent" },
    { key: "notes", label: "笔记", path: "/notes", tint: "brand" },
    { key: "more", label: "更多", path: "/more", tint: "accent" },
  ];
});
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="今日" show-sync />

    <div class="space-y-3 p-4">
      <!-- Hero -->
      <section
        class="relative overflow-hidden rounded-3xl bg-stone-50 ring-1 ring-stone-100 shadow-card"
      >
        <img
          src="/hero-dashboard.png"
          alt=""
          class="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div class="relative px-5 py-6">
          <div class="text-xs font-medium tracking-wide text-stone-500">
            {{ todayLabel }}
          </div>
          <div class="mt-2 text-2xl font-semibold leading-tight text-stone-800">
            {{ greeting }}，<br />今天想做点什么？
          </div>
          <div class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] text-stone-600 backdrop-blur-sm ring-1 ring-stone-200/60">
            <span class="h-1.5 w-1.5 rounded-full bg-brand-500"></span>
            AI 助手已就绪
          </div>
          <button
            class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition active:scale-95"
            @click="go('/chat')"
          >
            开始对话
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <!-- 快捷入口 -->
      <section class="grid grid-cols-4 gap-2">
        <button
          v-for="q in quickEntries"
          :key="q.key"
          class="flex flex-col items-center gap-2 rounded-2xl bg-white py-3 shadow-card ring-1 ring-stone-100 transition active:scale-95"
          @click="go(q.path)"
        >
          <span
            class="flex h-10 w-10 items-center justify-center rounded-xl"
            :class="q.tint === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-accent-50 text-accent-600'"
          >
            <!-- chat -->
            <svg v-if="q.key === 'chat'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5z" />
              <path d="M17.5 2.8 18 4.5l1.7.5-1.7.5-.5 1.7-.5-1.7-1.7-.5 1.7-.5z" fill="currentColor" stroke="none" />
            </svg>
            <!-- tasks -->
            <svg v-else-if="q.key === 'tasks'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="4" width="14" height="17" rx="2.5" />
              <path d="M9 4v1.5h6V4" />
              <path d="M8.5 12.5l2 2 4-4.5" />
              <path d="M8.5 17.5h7" />
            </svg>
            <!-- calendar -->
            <svg v-else-if="q.key === 'calendar'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
              <path d="M3.5 9.5h17" />
              <path d="M8 3v4M16 3v4" />
              <circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <!-- settings -->
            <svg v-else-if="q.key === 'settings'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <!-- notes -->
            <svg v-else-if="q.key === 'notes'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H17l3 3v13.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
            <!-- more -->
            <svg v-else-if="q.key === 'more'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span class="text-xs text-stone-600">{{ q.label }}</span>
        </button>
      </section>

      <!-- 今日日程 -->
      <section class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
                <path d="M3.5 9.5h17M8 3v4M16 3v4" />
              </svg>
            </span>
            <h2 class="text-sm font-semibold text-stone-800">今日日程</h2>
          </div>
          <button class="text-xs text-brand-600" @click="go('/calendar')">全部</button>
        </div>
        <Empty v-if="!todayEvents.length" description="今日无日程" :image-size="60" />
        <CellGroup v-else inset>
          <Cell
            v-for="e in todayEvents"
            :key="e.id"
            :title="e.title"
            :label="e.all_day ? '全天' : fmtTime(e.start_at)"
            @click="go('/calendar')"
          />
        </CellGroup>
      </section>

      <!-- 今日待办 -->
      <section class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-md bg-accent-50 text-accent-600">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6l2 2 4-4" />
                <path d="M12 6h8M12 12h8M12 18h8" />
              </svg>
            </span>
            <h2 class="text-sm font-semibold text-stone-800">
              待办 <span class="text-xs text-stone-400">({{ todayPendingTodos.length }})</span>
            </h2>
          </div>
          <button class="text-xs text-brand-600" @click="go('/tasks')">全部</button>
        </div>
        <Empty v-if="!todayPendingTodos.length" description="暂无任务" :image-size="60" />
        <ul v-else class="space-y-2.5 text-sm">
          <li
            v-for="t in todayPendingTodos.slice(0, 5)"
            :key="t.id"
            class="flex items-center justify-between gap-2"
          >
            <span class="flex-1 truncate text-stone-700">{{ t.title }}</span>
            <Tag v-if="t.priority === 2" type="danger" plain>紧急</Tag>
            <Tag v-else-if="t.priority === 1" type="warning" plain>重要</Tag>
            <span v-if="t.due_at" class="text-xs text-stone-400">
              {{ fmtTime(t.due_at) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 昨日日报 -->
      <section
        class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100 transition active:bg-stone-50"
        @click="go('/reports')"
      >
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 4h14a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1z" />
                <path d="M8 9h8M8 13h6" />
              </svg>
            </span>
            <h2 class="text-sm font-semibold text-stone-800">昨日日报</h2>
          </div>
          <span class="text-xs text-brand-600">查看全部 ›</span>
        </div>
        <p v-if="yesterdayReport" class="text-sm leading-relaxed text-stone-600 line-clamp-3">
          {{ yesterdayReport.summary }}
        </p>
        <p v-else class="text-xs text-stone-400">尚未生成，点此进入日报页一键生成</p>
      </section>
    </div>
  </div>
</template>
