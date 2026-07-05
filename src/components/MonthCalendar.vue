<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  minDate?: Date;
  maxDate?: Date;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth());

function syncView(dateStr: string) {
  if (!dateStr) return;
  const d = new Date(dateStr + "T00:00:00");
  if (!isNaN(d.getTime())) {
    viewYear.value = d.getFullYear();
    viewMonth.value = d.getMonth();
  }
}

syncView(props.modelValue);
watch(() => props.modelValue, (v) => syncView(v));

const monthLabel = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`);

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

interface Cell {
  date: string | null;
  day: number | null;
  disabled: boolean;
  selected: boolean;
  isToday: boolean;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const cells = computed<Cell[]>(() => {
  const year = viewYear.value;
  const month = viewMonth.value;
  const firstDay = new Date(year, month, 1);
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const list: Cell[] = [];

  for (let i = 0; i < offset; i++) {
    list.push({ date: null, day: null, disabled: false, selected: false, isToday: false });
  }

  const minTime = props.minDate ? startOfDay(props.minDate).getTime() : null;
  const maxTime = props.maxDate ? startOfDay(props.maxDate).getTime() : null;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const t = new Date(year, month, day).getTime();
    let disabled = false;
    if (minTime !== null && t < minTime) disabled = true;
    if (maxTime !== null && t > maxTime) disabled = true;
    list.push({
      date: dateStr,
      day,
      disabled,
      selected: dateStr === props.modelValue,
      isToday: dateStr === todayStr,
    });
  }

  return list;
});

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

function select(cell: Cell) {
  if (cell.date === null || cell.disabled) return;
  emit("update:modelValue", cell.date);
}
</script>

<template>
  <div class="select-none">
    <div class="mb-3 flex items-center justify-between">
      <button
        class="rounded-md p-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
        aria-label="上一月"
        @click="prevMonth"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span class="text-base font-medium text-stone-800">{{ monthLabel }}</span>
      <button
        class="rounded-md p-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
        aria-label="下一月"
        @click="nextMonth"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
      <div v-for="w in weekDays" :key="w" class="py-1">{{ w }}</div>
    </div>
    <div class="mt-1 grid grid-cols-7 gap-1">
      <button
        v-for="(cell, i) in cells"
        :key="i"
        :disabled="cell.date === null || cell.disabled"
        class="flex aspect-square items-center justify-center rounded-md text-sm transition"
        :class="[
          cell.date === null
            ? 'pointer-events-none'
            : cell.selected
              ? 'bg-brand-500 text-white font-semibold'
              : cell.disabled
                ? 'cursor-not-allowed text-stone-300'
                : cell.isToday
                  ? 'bg-brand-50 font-medium text-brand-600 hover:bg-brand-100'
                  : 'text-stone-700 hover:bg-stone-100',
        ]"
        @click="select(cell)"
      >
        {{ cell.day ?? "" }}
      </button>
    </div>
  </div>
</template>
