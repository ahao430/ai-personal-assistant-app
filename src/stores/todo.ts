import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  deleteTodo,
  listTodos,
  setTodoStatus,
  upsertTodo,
  type TodoRow,
  type TodoStatus,
} from "@/db/repos";
import { scheduleNotification } from "@/api/notify";

export type TodoFilter = "today" | "week" | "all" | "done";

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function endOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

export const useTodoStore = defineStore("todo", () => {
  const items = ref<TodoRow[]>([]);
  const filter = ref<TodoFilter>("today");
  const loading = ref(false);

  const filtered = computed<TodoRow[]>(() => {
    const now = new Date();
    switch (filter.value) {
      case "today": {
        const s = startOfDay(now);
        const e = endOfDay(now);
        return items.value.filter(
          (t) =>
            t.status === "pending" &&
            (t.due_at == null || (t.due_at >= s && t.due_at <= e))
        );
      }
      case "week": {
        const s = startOfDay(now);
        const e = startOfDay(new Date(now.getTime() + 7 * 86400_000));
        return items.value.filter(
          (t) =>
            t.status === "pending" &&
            (t.due_at == null || (t.due_at >= s && t.due_at < e))
        );
      }
      case "done":
        return items.value.filter((t) => t.status === "done");
      case "all":
      default:
        return items.value.filter((t) => t.status !== "done");
    }
  });

  async function reload() {
    loading.value = true;
    try {
      items.value = await listTodos({ status: "all" });
    } finally {
      loading.value = false;
    }
  }

  async function save(
    row: Partial<TodoRow> & { title: string }
  ): Promise<string> {
    const id = await upsertTodo(row);
    await reload();
    // 设置/取消提醒
    const fresh = items.value.find((t) => t.id === id);
    if (fresh?.remind_at && fresh.remind_at > Date.now()) {
      try {
        await scheduleNotification({
          atMs: fresh.remind_at,
          title: "待办提醒",
          body: fresh.title,
          id: `todo-${id}`,
        });
      } catch (e) {
        console.warn("[notify] schedule failed", e);
      }
    }
    return id;
  }

  async function toggle(t: TodoRow) {
    const next: TodoStatus = t.status === "done" ? "pending" : "done";
    await setTodoStatus(t.id, next);
    await reload();
  }

  async function remove(id: string) {
    await deleteTodo(id);
    await reload();
  }

  return { items, filter, loading, filtered, reload, save, toggle, remove };
});
