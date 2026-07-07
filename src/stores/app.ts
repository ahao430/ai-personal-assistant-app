import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { showToast } from "vant";
import { useSyncStore } from "./sync";

export const useAppStore = defineStore("app", () => {
  const syncing = ref(false);

  const sync = useSyncStore();
  const lastSyncedAt = computed(() => sync.lastSyncedAt);
  const lastSyncError = computed(() => sync.lastError);
  const lastSyncResult = computed(() => sync.lastResult);

  async function triggerSync() {
    if (syncing.value) return;
    syncing.value = true;
    try {
      const result = await sync.triggerSync();
      if (result) {
        if (result.errors.length) {
          showToast(`同步完成（${result.errors.length} 个错误）`);
        } else {
          showToast(
            `已同步 · ↑${result.pushed} ↓${result.pulled} 图↑${result.imagePushed} 图↓${result.imagePulled} 跳${result.skipped}`
          );
        }
      } else if (sync.lastError) {
        showToast(sync.lastError);
      }
    } finally {
      syncing.value = false;
    }
  }

  return { syncing, lastSyncedAt, lastSyncError, lastSyncResult, triggerSync };
});
