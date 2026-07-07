<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { useSearchStore, type SearchKind } from "@/stores/search";

const router = useRouter();
const search = useSearchStore();

const hasQuery = computed(() => search.query.trim().length > 0);
const emptyText = computed(() => hasQuery.value ? "没有找到相关内容" : "输入关键词搜索对话、笔记和画图记录");

function submitSearch() {
  search.search(search.query);
}

function openResult(path: string) {
  router.push(path);
}

function kindLabel(kind: SearchKind) {
  if (kind === "chat") return "对话";
  if (kind === "note") return "笔记";
  return "画图";
}

function formatTime(time: number) {
  return new Date(time).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="搜索" show-back show-sync />

    <main class="space-y-3 p-4">
      <form class="flex gap-2" @submit.prevent="submitSearch">
        <input
          v-model="search.query"
          class="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-stone-800 shadow-card outline-none ring-1 ring-stone-100 placeholder:text-stone-400 focus:ring-brand-200"
          placeholder="搜索对话、笔记、画图提示词"
          enterkeyhint="search"
        />
        <button
          class="rounded-2xl bg-brand-600 px-4 text-sm font-medium text-white shadow-card transition active:scale-[0.98] disabled:bg-stone-300"
          :disabled="search.loading || !hasQuery"
          type="submit"
        >
          {{ search.loading ? "搜索中" : "搜索" }}
        </button>
      </form>

      <div v-if="search.results.length" class="space-y-2">
        <button
          v-for="result in search.results"
          :key="result.id"
          class="w-full rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-stone-100 transition active:scale-[0.99]"
          @click="openResult(result.path)"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 truncate text-sm font-semibold text-stone-800">
              {{ result.title }}
            </div>
            <div class="flex flex-shrink-0 items-center gap-2 text-[11px] text-stone-400">
              <span class="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">{{ kindLabel(result.kind) }}</span>
              <span>{{ formatTime(result.time) }}</span>
            </div>
          </div>
          <p class="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">
            {{ result.snippet }}
          </p>
        </button>
      </div>

      <div v-else class="rounded-3xl bg-white px-6 py-12 text-center text-sm text-stone-400 shadow-card ring-1 ring-stone-100">
        {{ emptyText }}
      </div>
    </main>
  </div>
</template>
