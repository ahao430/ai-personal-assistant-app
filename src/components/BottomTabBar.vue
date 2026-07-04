<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  faHouse,
  faComments,
  faCalendarDays,
  faListCheck,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import type { TabKey } from "@/router";

const props = defineProps<{
  modelValue?: TabKey;
}>();

const route = useRoute();
const router = useRouter();

const active = computed<TabKey>(
  () => (props.modelValue ?? (route.meta.tab as TabKey)) ?? "dashboard"
);

const tabs: { key: TabKey; label: string; icon: typeof faHouse }[] = [
  { key: "dashboard", label: "今日", icon: faHouse },
  { key: "chat", label: "对话", icon: faComments },
  { key: "calendar", label: "日历", icon: faCalendarDays },
  { key: "tasks", label: "待办", icon: faListCheck },
  { key: "settings", label: "我的", icon: faUser },
];

function go(key: TabKey) {
  if (key === active.value) return;
  router.push({ name: key });
}
</script>

<template>
  <nav
    class="flex items-stretch justify-around border-t border-stone-100 bg-white/95 backdrop-blur"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition"
      :class="active === tab.key ? 'text-brand-600' : 'text-stone-400'"
      @click="go(tab.key)"
    >
      <span
        class="relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
        :class="active === tab.key ? 'bg-brand-50' : 'bg-transparent'"
      >
        <FontAwesomeIcon :icon="tab.icon" class="h-[18px] w-[18px]" />
      </span>
      <span class="font-medium">{{ tab.label }}</span>
    </button>
  </nav>
</template>
