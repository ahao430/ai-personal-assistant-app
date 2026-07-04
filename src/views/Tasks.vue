<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import {
  Button,
  Cell,
  CellGroup,
  Checkbox,
  Empty,
  Field,
  Popup,
  Radio,
  RadioGroup,
  showConfirmDialog,
  showToast,
  SwipeCell,
  Tag,
} from "vant";
import { useTodoStore } from "@/stores/todo";
import type { TodoRow } from "@/db/repos";

const store = useTodoStore();

const showEditor = ref(false);
const editing = ref<Partial<TodoRow> & { title: string }>({
  title: "",
  description: "",
  priority: 0,
  due_at: null,
  remind_at: null,
});
const isEdit = computed(() => !!editing.value.id);

const tabs: { key: typeof store.filter; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "all", label: "全部" },
  { key: "done", label: "已完成" },
];

onMounted(() => store.reload());

function openAdd() {
  editing.value = {
    title: "",
    description: "",
    priority: 0,
    due_at: null,
    remind_at: null,
  };
  showEditor.value = true;
}

function openEdit(t: TodoRow) {
  editing.value = { ...t };
  showEditor.value = true;
}

async function save() {
  if (!editing.value.title?.trim()) {
    showToast("请输入任务标题");
    return;
  }
  await store.save({ ...editing.value, title: editing.value.title.trim() });
  showEditor.value = false;
  showToast("已保存");
}

async function remove(t: TodoRow) {
  try {
    await showConfirmDialog({ title: "删除", message: `删除「${t.title}」？` });
    await store.remove(t.id);
    showToast("已删除");
  } catch {
    // cancel
  }
}

function priorityTag(p: number) {
  if (p === 2) return { type: "danger", text: "紧急" };
  if (p === 1) return { type: "warning", text: "重要" };
  return null;
}

function fmtTime(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const sameYear = d.getFullYear() === today.getFullYear();
  const opt: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("zh-CN", opt);
}

const dueInput = computed({
  get: () => (editing.value.due_at ? toLocalInput(editing.value.due_at) : ""),
  set: (v: string) => (editing.value.due_at = v ? fromLocalInput(v) : null),
});
const remindInput = computed({
  get: () => (editing.value.remind_at ? toLocalInput(editing.value.remind_at) : ""),
  set: (v: string) => (editing.value.remind_at = v ? fromLocalInput(v) : null),
});

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): number {
  return new Date(v).getTime();
}
</script>

<template>
  <div>
    <AppHeader title="待办" />
    <div class="sticky top-[57px] z-10 flex border-b border-gray-100 bg-white text-sm">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="flex-1 py-2 transition"
        :class="
          store.filter === t.key
            ? 'border-b-2 border-brand-500 font-medium text-brand-600'
            : 'text-gray-500'
        "
        @click="store.filter = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="p-2">
      <Empty v-if="!store.filtered.length" description="暂无任务" />

      <div v-else class="space-y-2">
        <SwipeCell
          v-for="t in store.filtered"
          :key="t.id"
        >
          <Cell
            :title="t.title"
            :label="[fmtTime(t.due_at), t.description].filter(Boolean).join(' · ')"
            is-link
            @click="openEdit(t)"
          >
            <template #icon>
              <div class="flex items-center pl-3">
                <Checkbox
                  :model-value="t.status === 'done'"
                  shape="square"
                  @click.stop="store.toggle(t)"
                />
              </div>
            </template>
            <template #value>
              <Tag v-if="priorityTag(t.priority)" :type="(priorityTag(t.priority)!.type as any)" plain>
                {{ priorityTag(t.priority)!.text }}
              </Tag>
            </template>
          </Cell>
          <template #right>
            <Button
              v-if="t.status !== 'done'"
              type="primary"
              square
              class="!h-full"
              @click="store.toggle(t)"
            >完成</Button>
            <Button type="danger" square class="!h-full" @click="remove(t)">删除</Button>
          </template>
        </SwipeCell>
      </div>
    </div>

    <button
      class="fixed bottom-20 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg active:bg-brand-600"
      style="margin-bottom: env(safe-area-inset-bottom)"
      @click="openAdd"
      aria-label="新增"
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>

    <Popup v-model:show="showEditor" position="bottom" :style="{ height: '70%' }" round>
      <div class="flex h-full flex-col p-3">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-base font-medium">{{ isEdit ? "编辑任务" : "新建任务" }}</span>
          <button class="text-gray-400" @click="showEditor = false">关闭</button>
        </div>
        <CellGroup inset class="flex-1 overflow-y-auto">
          <Field v-model="editing.title" label="标题" placeholder="必填" />
          <Field
            v-model="editing.description"
            type="textarea"
            label="备注"
            rows="2"
            autosize
          />
          <Field label="优先级">
            <template #input>
              <RadioGroup v-model="editing.priority" direction="horizontal">
                <Radio :name="0">普通</Radio>
                <Radio :name="1">重要</Radio>
                <Radio :name="2">紧急</Radio>
              </RadioGroup>
            </template>
          </Field>
          <Field v-model="dueInput" label="截止时间" type="datetime-local" />
          <Field v-model="remindInput" label="提醒时间" type="datetime-local" />
        </CellGroup>
        <Button block type="primary" class="mt-3" @click="save">保存</Button>
      </div>
    </Popup>
  </div>
</template>
