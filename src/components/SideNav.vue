<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  faHouse,
  faComments,
  faCalendarDays,
  faListCheck,
  faUser,
  faTableColumns,
  faImage,
  faBookOpen,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import type { TabKey } from "@/router";

const route = useRoute();
const router = useRouter();

const collapsed = ref(false);

function toggleCollapse() {
  collapsed.value = !collapsed.value;
}

const active = computed<TabKey>(
  () => (route.meta.tab as TabKey) ?? "dashboard"
);

const tabs: { key: TabKey; label: string; icon: typeof faHouse }[] = [
  { key: "dashboard", label: "今日", icon: faHouse },
  { key: "chat", label: "对话", icon: faComments },
  { key: "search", label: "搜索", icon: faMagnifyingGlass },
  { key: "image-gen", label: "画图", icon: faImage },
  { key: "calendar", label: "日历", icon: faCalendarDays },
  { key: "tasks", label: "待办", icon: faListCheck },
  { key: "notes", label: "笔记", icon: faBookOpen },
  { key: "settings", label: "我的", icon: faUser },
];

function go(key: TabKey) {
  if (key === active.value) return;
  router.push({ name: key });
}
</script>

<template>
  <aside
    class="flex h-screen flex-shrink-0 flex-col border-r border-stone-100 bg-white transition-[width] duration-200 ease-out"
    :class="collapsed ? 'w-14' : 'w-56'"
  >
    <!-- Brand -->
    <div
      class="flex flex-col transition-all duration-200"
      :class="collapsed ? 'items-center px-1.5 pt-4' : 'px-4 pt-5 pb-4'"
    >
      <img
        src="/app-icon.png"
        alt=""
        class="flex-shrink-0 rounded-xl shadow-sm transition-all duration-200"
        :class="collapsed ? 'h-7 w-7' : 'h-9 w-9'"
      />
      <template v-if="!collapsed">
        <h1 class="mt-2.5 text-sm font-semibold tracking-tight text-stone-800">AI 助手</h1>
        <p class="mt-0.5 text-[11px] text-stone-400">个人 AI 助手 · 跨端同步</p>
      </template>
    </div>

    <!-- Nav -->
    <nav
      class="flex-1 transition-all duration-200"
      :class="collapsed ? 'space-y-1 px-1.5 pt-3' : 'space-y-0.5 px-3'"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="group relative flex items-center rounded-xl text-sm transition active:scale-[0.98]"
        :class="{
          'justify-center py-2.5 w-full': collapsed,
          'w-full gap-3 px-3 py-2.5': !collapsed,
          'bg-brand-50 font-medium text-brand-700': active === tab.key && !collapsed,
          'bg-brand-50 text-brand-700': active === tab.key && collapsed,
          'text-stone-500 hover:bg-stone-50': active !== tab.key,
        }"
        @click="go(tab.key)"
      >
        <FontAwesomeIcon
          :icon="tab.icon"
          class="h-[18px] w-[18px] flex-shrink-0"
        />

        <span v-if="!collapsed">{{ tab.label }}</span>

        <!-- Tooltip (collapsed hover) -->
        <span
          v-if="collapsed"
          class="pointer-events-none absolute left-full ml-2.5 rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap z-50"
        >
          {{ tab.label }}
          <span class="absolute right-full top-1/2 -mt-1 border-4 border-transparent border-r-stone-800" />
        </span>
      </button>
    </nav>

    <!-- Footer / toggle -->
    <div
      class="flex items-center border-t border-stone-100 py-2.5 transition-all duration-200"
      :class="collapsed ? 'justify-center px-0' : 'justify-end px-4'"
    >
      <button
        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-500 active:scale-90"
        @click="toggleCollapse"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
      >
        <FontAwesomeIcon :icon="faTableColumns" class="h-4 w-4" />
      </button>
    </div>
  </aside>
</template>
