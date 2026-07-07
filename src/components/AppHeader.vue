<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";

defineProps<{
  title: string;
  showSync?: boolean;
  showBack?: boolean;
}>();

const app = useAppStore();
const router = useRouter();

async function onSync() {
  await app.triggerSync();
}

const syncStatusText = computed(() => {
  if (app.syncing) return "同步中";
  if (app.lastSyncError) return "同步失败";
  if (!app.lastSyncedAt) return "未同步";
  return `已同步 ${formatTime(app.lastSyncedAt)}`;
});

function formatTime(time: number) {
  return new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function onBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push("/dashboard");
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-10 flex items-center gap-1 border-b border-stone-100 bg-white/95 px-2 py-2.5 backdrop-blur"
    style="padding-top: max(0.625rem, env(safe-area-inset-top))"
  >
    <button
      v-if="showBack"
      class="flex h-9 w-9 items-center justify-center rounded-full text-stone-700 transition active:bg-stone-100"
      @click="onBack"
      aria-label="返回"
    >
      <svg
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
    <div class="flex flex-1 items-center gap-1 px-1 min-w-0">
      <h1 class="text-base font-semibold text-stone-800">{{ title }}</h1>
      <slot name="title-suffix" />
    </div>
    <button
      v-if="showSync"
      class="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-brand-600 transition active:bg-brand-50"
      :disabled="app.syncing"
      :class="{ 'opacity-60': app.syncing, 'text-red-500': app.lastSyncError }"
      @click="onSync"
      :aria-label="syncStatusText"
    >
      <svg
        class="h-5 w-5 flex-shrink-0"
        :class="{ 'animate-spin': app.syncing }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
      <span class="hidden max-w-28 truncate text-[11px] font-medium sm:inline">
        {{ syncStatusText }}
      </span>
    </button>
    <slot name="right" />
  </header>
</template>
