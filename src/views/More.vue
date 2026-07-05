<script setup lang="ts">
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";

const router = useRouter();

interface MoreEntry {
  key: string;
  label: string;
  desc: string;
  path: string;
  tint: "brand" | "accent";
  icon: "tasks" | "notes" | "image";
}

const entries: MoreEntry[] = [
  { key: "tasks", label: "待办", desc: "管理任务与提醒", path: "/tasks", tint: "accent", icon: "tasks" },
  { key: "notes", label: "笔记", desc: "Markdown 笔记，多端同步", path: "/notes", tint: "brand", icon: "notes" },
  { key: "image", label: "画图", desc: "单次生成图片，可选参考图", path: "/image-gen", tint: "accent", icon: "image" },
];

function go(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="更多" />
    <div class="p-4">
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="e in entries"
          :key="e.key"
          class="flex flex-col gap-3 rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-stone-100 transition active:scale-[0.98]"
          @click="go(e.path)"
        >
          <span
            class="flex h-10 w-10 items-center justify-center rounded-xl"
            :class="e.tint === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-accent-50 text-accent-600'"
          >
            <!-- tasks -->
            <svg v-if="e.icon === 'tasks'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="4" width="14" height="17" rx="2.5" />
              <path d="M9 4v1.5h6V4" />
              <path d="M8.5 12.5l2 2 4-4.5" />
              <path d="M8.5 17.5h7" />
            </svg>
            <!-- notes -->
            <svg v-else-if="e.icon === 'notes'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H17l3 3v13.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5z" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
            <!-- image -->
            <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="M21 16l-5-4-7 6" />
            </svg>
          </span>
          <div>
            <div class="text-sm font-semibold text-stone-800">{{ e.label }}</div>
            <div class="mt-0.5 text-xs text-stone-500">{{ e.desc }}</div>
          </div>
        </button>
      </div>

      <p class="mt-6 px-2 text-xs text-stone-400">
        后续新功能会加到这里。
      </p>
    </div>
  </div>
</template>
