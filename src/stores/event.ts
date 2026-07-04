import { defineStore } from "pinia";
import { ref } from "vue";
import {
  deleteEvent,
  listEventsInRange,
  upsertEvent,
  type EventRow,
} from "@/db/repos";

export const useEventStore = defineStore("event", () => {
  const items = ref<EventRow[]>([]);
  const loading = ref(false);

  async function loadMonth(year: number, month: number) {
    loading.value = true;
    try {
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 0, 23, 59, 59, 999).getTime();
      items.value = await listEventsInRange(start, end);
    } finally {
      loading.value = false;
    }
  }

  async function save(row: Partial<EventRow> & { title: string; start_at: number }) {
    const id = await upsertEvent(row);
    const d = new Date(row.start_at);
    await loadMonth(d.getFullYear(), d.getMonth() + 1);
    return id;
  }

  async function remove(id: string) {
    await deleteEvent(id);
    // 简单刷新当前月
    if (items.value.length) {
      const first = items.value[0];
      const d = new Date(first.start_at);
      await loadMonth(d.getFullYear(), d.getMonth() + 1);
    }
  }

  return { items, loading, loadMonth, save, remove };
});
