<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import {
  Button,
  Cell,
  CellGroup,
  Empty,
  Field,
  Popup,
  Switch,
  Tag,
  showConfirmDialog,
  showToast,
} from "vant";
import { useEventStore } from "@/stores/event";
import { useHolidays, type HolidayLabel } from "@/composables/useHolidays";
import { getReport, getReportsRange, type DailyReportRow } from "@/api/report";
import { getUserPref, setUserPref } from "@/db/repos";
import type { EventRow } from "@/db/repos";

const store = useEventStore();
const router = useRouter();
const { ensureYear: ensureHolidayYear, getDayLabel: getHolidayLabel, loadedYears } = useHolidays();

const today = new Date();
const cursor = ref<{ year: number; month: number }>({
  year: today.getFullYear(),
  month: today.getMonth() + 1,
});
const selectedDay = ref<number>(today.getDate());

const monthMatrix = computed(() => buildMonthMatrix(cursor.value.year, cursor.value.month));

/** 当月每个日期的节假日展示信息 */
const cellHolidays = computed<Record<number, HolidayLabel | null>>(() => {
  // 触发响应式：节假日数据异步加载完后会重算
  loadedYears.has(cursor.value.year);
  const map: Record<number, HolidayLabel | null> = {};
  for (let d = 1; d <= 31; d++) {
    map[d] = getHolidayLabel(cursor.value.year, cursor.value.month, d);
  }
  return map;
});

const holidayOfSelected = computed(() => {
  loadedYears.has(cursor.value.year);
  return getHolidayLabel(cursor.value.year, cursor.value.month, selectedDay.value);
});

const eventsOfSelectedDay = computed<EventRow[]>(() => {
  const date = new Date(cursor.value.year, cursor.value.month - 1, selectedDay.value);
  const dayStart = new Date(date).setHours(0, 0, 0, 0);
  const dayEnd = new Date(date).setHours(23, 59, 59, 999);
  return store.items.filter(
    (e) => e.start_at >= dayStart && e.start_at <= dayEnd
  );
});

/** 每个日期 cell 是否有事件 */
const eventDayMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {};
  const y = cursor.value.year;
  const m = cursor.value.month - 1;
  for (const e of store.items) {
    const d = new Date(e.start_at);
    if (d.getFullYear() === y && d.getMonth() === m) {
      map[d.getDate()] = (map[d.getDate()] ?? 0) + 1;
    }
  }
  return map;
});

function buildMonthMatrix(year: number, month: number) {
  // month: 1-12
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function prevMonth() {
  let { year, month } = cursor.value;
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  cursor.value = { year, month };
}
function nextMonth() {
  let { year, month } = cursor.value;
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  cursor.value = { year, month };
}

watch(cursor, () => store.loadMonth(cursor.value.year, cursor.value.month), { immediate: false });

onMounted(() => {
  store.loadMonth(cursor.value.year, cursor.value.month);
  ensureHolidayYear(cursor.value.year);
});

watch(
  () => cursor.value.year,
  (y) => ensureHolidayYear(y),
);

// 编辑器
const showEditor = ref(false);
const editing = ref<Partial<EventRow> & { title: string; start_at: number }>({
  title: "",
  start_at: Date.now(),
});
const isEdit = computed(() => !!editing.value.id);

const startInput = computed({
  get: () => toLocalInput(editing.value.start_at ?? Date.now()),
  set: (v: string) => (editing.value.start_at = fromLocalInput(v)),
});
const endInput = computed({
  get: () => (editing.value.end_at ? toLocalInput(editing.value.end_at) : ""),
  set: (v: string) => (editing.value.end_at = v ? fromLocalInput(v) : null),
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

function openAdd(day?: number) {
  const d = new Date(cursor.value.year, cursor.value.month - 1, day ?? selectedDay.value);
  d.setHours(new Date().getHours() + 1, 0, 0, 0);
  editing.value = { title: "", start_at: d.getTime(), all_day: 0 };
  showEditor.value = true;
}

function openEdit(e: EventRow) {
  editing.value = { ...e };
  showEditor.value = true;
}

async function save() {
  if (!editing.value.title?.trim()) return showToast("请输入标题");
  await store.save({ ...editing.value, title: editing.value.title.trim() });
  showEditor.value = false;
  showToast("已保存");
}

async function remove() {
  if (!editing.value.id) return;
  try {
    await showConfirmDialog({ title: "删除", message: "确认删除此事件？" });
    await store.remove(editing.value.id!);
    showEditor.value = false;
    showToast("已删除");
  } catch {
    // cancel
  }
}

function fmtRange(e: EventRow): string {
  const s = new Date(e.start_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sStr = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
  if (e.all_day) return "全天";
  if (e.end_at) {
    const en = new Date(e.end_at);
    return `${sStr} - ${pad(en.getHours())}:${pad(en.getMinutes())}`;
  }
  return sStr;
}

const monthLabel = computed(
  () => `${cursor.value.year} 年 ${cursor.value.month} 月`
);

const selectedDateKey = computed(() => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${cursor.value.year}-${pad(cursor.value.month)}-${pad(selectedDay.value)}`;
});

const dayLog = ref("");
const savingDayLog = ref(false);

async function loadDayLog() {
  dayLog.value = await getUserPref<string>(`calendar_log:${selectedDateKey.value}`) ?? "";
}

async function saveDayLog() {
  savingDayLog.value = true;
  try {
    await setUserPref(`calendar_log:${selectedDateKey.value}`, dayLog.value);
    showToast("日志已保存");
  } finally {
    savingDayLog.value = false;
  }
}

watch(selectedDateKey, () => { loadDayLog(); }, { immediate: true });

const isPastDay = computed(() => {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const sel = new Date(cursor.value.year, cursor.value.month - 1, selectedDay.value);
  return sel.getTime() < today0.getTime();
});

function goReport() {
  router.push({ path: "/reports", query: { date: selectedDateKey.value } });
}

// ----- 当日 / 当周日报 -----
const dayReport = ref<DailyReportRow | null>(null);
const weekReports = ref<DailyReportRow[]>([]);

const weekRange = computed(() => {
  const d = new Date(cursor.value.year, cursor.value.month - 1, selectedDay.value);
  const weekday = d.getDay(); // 0=Sun
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`,
    end: `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`,
    startLabel: `${monday.getMonth() + 1}/${monday.getDate()}`,
    endLabel: `${sunday.getMonth() + 1}/${sunday.getDate()}`,
  };
});

const weekSummary = computed(() => {
  const list = weekReports.value;
  if (!list.length) return null;
  const done = list.reduce((s, r) => s + (r.todo_done ?? 0), 0);
  const pending = list.reduce((s, r) => s + (r.todo_pending ?? 0), 0);
  const events = list.reduce((s, r) => s + (r.events_count ?? 0), 0);
  return {
    days: list.length,
    done,
    pending,
    events,
    firstExcerpt: list[0]?.summary?.slice(0, 120) ?? "",
  };
});

async function loadReports() {
  dayReport.value = await getReport(selectedDateKey.value);
  weekReports.value = await getReportsRange(weekRange.value.start, weekRange.value.end);
}

watch(
  () => [cursor.value.year, cursor.value.month, selectedDay.value],
  () => { loadReports(); },
  { immediate: false }
);

onMounted(() => {
  loadReports();
});

function fmtExcerpt(s: string, n = 140): string {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
function cellClass(year: number, month: number, day: number | null) {
  if (day == null) return "";
  const key = `${year}-${month}-${day}`;
  const cls: string[] = [];
  if (key === todayKey) cls.push("bg-brand-50", "font-bold", "text-brand-600");
  if (day === selectedDay.value) cls.push("!bg-brand-500", "!text-white");
  return cls.join(" ");
}
</script>

<template>
  <div>
    <AppHeader title="日历" />

    <!-- 月份切换 -->
    <div class="flex items-center justify-between bg-white px-4 py-2">
      <button class="px-2 py-1 text-gray-500" @click="prevMonth">‹</button>
      <span class="text-base font-medium">{{ monthLabel }}</span>
      <button class="px-2 py-1 text-gray-500" @click="nextMonth">›</button>
    </div>

    <!-- 星期表头 -->
    <div class="grid grid-cols-7 bg-white pb-1 text-center text-xs text-gray-400">
      <span v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w">{{ w }}</span>
    </div>

    <!-- 月历 -->
    <div class="grid grid-cols-7 gap-px bg-gray-100 px-px">
      <button
        v-for="(day, i) in monthMatrix"
        :key="i"
        class="relative flex aspect-square flex-col items-center justify-center gap-1 bg-white text-base leading-none md:aspect-auto md:h-16"
        :class="cellClass(cursor.year, cursor.month, day)"
        @click="day && (selectedDay = day)"
      >
        <span
          v-if="day"
          class="relative inline-block"
        >
          <span
            :class="[
              cellHolidays[day]?.isCanonical && cellHolidays[day]?.isOffDay && day !== selectedDay ? 'text-red-500' : '',
              cellHolidays[day] && !cellHolidays[day]?.isOffDay && day !== selectedDay ? 'text-stone-400' : '',
            ]"
          >{{ day }}</span>
          <span
            v-if="cellHolidays[day] && !cellHolidays[day]?.isCanonical"
            class="absolute -top-2 -right-2.5 rounded-sm px-0.5 text-[11px] leading-tight font-medium"
            :class="cellHolidays[day]?.isOffDay
              ? (day === selectedDay ? 'bg-white/20 text-red-100' : 'bg-red-50 text-red-500')
              : (day === selectedDay ? 'bg-white/20 text-amber-100' : 'bg-amber-50 text-amber-600')"
          >{{ cellHolidays[day]?.text }}</span>
        </span>
        <span
          v-if="day && cellHolidays[day]?.isCanonical"
          class="max-w-full truncate px-0.5 text-[11px] leading-tight"
          :class="[
            cellHolidays[day]?.isOffDay
              ? (day === selectedDay ? 'text-red-100' : 'text-red-500')
              : (day === selectedDay ? 'text-amber-100' : 'text-amber-600'),
          ]"
        >{{ cellHolidays[day]?.text }}</span>
        <span
          v-if="day && eventDayMap[day]"
          class="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-current opacity-60"
        ></span>
      </button>
    </div>

    <!-- 当日事件 -->
    <div class="mt-2 p-3">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>{{ cursor.month }} 月 {{ selectedDay }} 日</span>
          <Tag
            v-if="holidayOfSelected"
            plain
            :type="holidayOfSelected.isOffDay ? 'danger' : 'warning'"
          >
            {{ holidayOfSelected.isCanonical
              ? `${holidayOfSelected.text}${holidayOfSelected.isOffDay ? ' · 休' : ' · 班'}`
              : holidayOfSelected.text }}
          </Tag>
        </h3>
        <div class="flex gap-2">
          <Button v-if="isPastDay" size="mini" plain @click="goReport">日报</Button>
          <Button size="mini" type="primary" plain @click="openAdd()">+ 事件</Button>
        </div>
      </div>
      <Empty v-if="!eventsOfSelectedDay.length" description="当天无事件" :image-size="56" />
      <div v-else class="space-y-2">
        <Cell
          v-for="e in eventsOfSelectedDay"
          :key="e.id"
          is-link
          @click="openEdit(e)"
        >
          <template #icon>
            <div class="mr-2 w-1 self-stretch rounded bg-brand-500"></div>
          </template>
          <template #title>
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ e.title }}</span>
              <Tag v-if="e.all_day" plain>全天</Tag>
            </div>
            <div class="text-xs text-gray-400">{{ fmtRange(e) }}</div>
            <div v-if="e.location" class="text-xs text-gray-400">📍 {{ e.location }}</div>
          </template>
        </Cell>
      </div>
    </div>

    <!-- 当日日志 -->
    <div class="mt-2 px-3 pb-2">
      <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">当日日志</h3>
          <Button size="mini" type="primary" plain :loading="savingDayLog" @click="saveDayLog">保存</Button>
        </div>
        <Field
          v-model="dayLog"
          type="textarea"
          rows="4"
          autosize
          placeholder="记录这一天的想法、复盘或流水账"
          class="rounded-xl bg-stone-50"
        />
      </div>
    </div>

    <!-- 当日日报 -->
    <div class="mt-2 px-3 pb-2">
      <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <span>📋</span>
            <span>当日日报</span>
          </h3>
          <Button size="mini" plain @click="goReport">
            {{ dayReport ? "查看" : "生成" }}
          </Button>
        </div>
        <div v-if="dayReport">
          <p class="text-xs text-gray-500">{{ fmtExcerpt(dayReport.summary) }}</p>
          <div class="mt-2 flex gap-3 text-[11px] text-gray-400">
            <span>✓ 完成 {{ dayReport.todo_done }}</span>
            <span>○ 待办 {{ dayReport.todo_pending }}</span>
            <span>📅 事件 {{ dayReport.events_count }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-gray-400">这一天还没有日报</p>
      </div>
    </div>

    <!-- 本周周报 -->
    <div class="px-3 pb-4">
      <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <span>📊</span>
            <span>本周周报 · {{ weekRange.startLabel }} - {{ weekRange.endLabel }}</span>
          </h3>
        </div>
        <div v-if="weekSummary">
          <div class="flex gap-3 text-[11px] text-gray-500">
            <span>📅 覆盖 {{ weekSummary.days }}/7 天</span>
            <span>✓ 完成 {{ weekSummary.done }}</span>
            <span>○ 待办 {{ weekSummary.pending }}</span>
            <span>📋 事件 {{ weekSummary.events }}</span>
          </div>
          <p v-if="weekSummary.firstExcerpt" class="mt-2 text-xs text-gray-400">
            {{ fmtExcerpt(weekSummary.firstExcerpt, 100) }}
          </p>
        </div>
        <p v-else class="text-xs text-gray-400">本周还没有日报</p>
      </div>
    </div>

    <!-- 编辑 Popup -->
    <Popup v-model:show="showEditor" position="bottom" :style="{ height: '70%' }" round>
      <div class="flex h-full flex-col p-3">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-base font-medium">{{ isEdit ? "编辑事件" : "新建事件" }}</span>
          <button class="text-gray-400" @click="showEditor = false">关闭</button>
        </div>
        <CellGroup inset class="flex-1 overflow-y-auto">
          <Field v-model="editing.title" label="标题" placeholder="必填" />
          <Field v-model="editing.description" type="textarea" label="备注" rows="2" autosize />
          <Field label="全天">
            <template #input>
              <Switch v-model="(editing.all_day as any)" />
            </template>
          </Field>
          <Field v-model="startInput" label="开始" type="datetime-local" />
          <Field v-model="endInput" label="结束" type="datetime-local" />
          <Field v-model="editing.location" label="地点" />
        </CellGroup>
        <div class="mt-3 flex gap-2">
          <Button v-if="isEdit" type="danger" plain class="flex-1" @click="remove">删除</Button>
          <Button block type="primary" class="flex-1" @click="save">保存</Button>
        </div>
      </div>
    </Popup>
  </div>
</template>
