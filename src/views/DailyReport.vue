<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import {
  Button,
  Cell,
  CellGroup,
  DatePicker,
  Empty,
  Field,
  Popup,
  showToast,
} from "vant";
import MonthCalendar from "@/components/MonthCalendar.vue";
import {
  downloadText,
  exportMarkdown,
  generateReport,
  getReport,
  listReports,
  type DailyReportRow,
} from "@/api/report";
import { useLlmConfigStore } from "@/stores/llm-config";
import { useLayoutMode } from "@/composables/useLayoutMode";

const route = useRoute();
const router = useRouter();
const llm = useLlmConfigStore();
const { isDesktop } = useLayoutMode();

const reports = ref<DailyReportRow[]>([]);
const selectedDate = ref<string>(new Date().toISOString().slice(0, 10));
const detail = ref<DailyReportRow | null>(null);
const generating = ref(false);
const showPicker = ref(false);
const showCalendar = ref(false);
const minDate = new Date(2020, 0, 1);
const maxDate = new Date();

onMounted(async () => {
  const q = route.query.date;
  if (typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
    selectedDate.value = q;
  }
  await Promise.all([llm.reload(), reload()]);
});

async function reload() {
  reports.value = await listReports();
  detail.value = await getReport(selectedDate.value);
}

async function pickDate(d: string) {
  selectedDate.value = d;
  showPicker.value = false;
  detail.value = await getReport(d);
}

async function onCalendarSelect(date: string) {
  selectedDate.value = date;
  showCalendar.value = false;
  detail.value = await getReport(date);
}

async function gen() {
  if (!llm.defaultConfig) {
    showToast("请先配置大模型");
    router.push("/settings/llm");
    return;
  }
  generating.value = true;
  try {
    await generateReport(selectedDate.value, llm.toApi(llm.defaultConfig));
    showToast("已生成");
    await reload();
  } catch (e) {
    showToast("生成失败：" + String(e));
  } finally {
    generating.value = false;
  }
}

function exportMd() {
  if (!detail.value) return;
  downloadText(`report-${detail.value.date}.md`, exportMarkdown(detail.value));
}

function shortSummary(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

const currentDateArr = computed<string[]>({
  get: () => selectedDate.value.split("-").map((n) => String(n).padStart(2, "0")),
  set: (v: string[]) => {
    selectedDate.value = v.join("-");
  },
});
</script>

<template>
  <div>
    <AppHeader title="每日日报" show-back />
    <div class="space-y-3 p-3">
      <CellGroup inset>
        <!-- 桌面：点击弹出日历 -->
        <Field
          v-if="isDesktop"
          label="选择日期"
          :model-value="selectedDate"
          input-align="right"
          is-link
          readonly
          @click="showCalendar = true"
        />
        <!-- 移动：picker 入口 -->
        <Cell v-else title="选择日期" :value="selectedDate" is-link @click="showPicker = true" />
        <Cell title="已有日报" :value="detail ? '✓' : '—'" />
      </CellGroup>

      <Button block type="primary" :loading="generating" @click="gen">
        {{ detail ? "重新生成" : "生成日报" }}
      </Button>

      <div v-if="detail" class="rounded-2xl bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-base font-semibold">{{ detail.date }} 日报</h2>
          <button class="text-xs text-brand-500" @click="exportMd">导出 Markdown</button>
        </div>
        <pre class="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-700">{{ detail.summary }}</pre>
        <div class="mt-3 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span>完成任务 {{ detail.todo_done }}</span>
          <span>待办 {{ detail.todo_pending }}</span>
          <span>事件 {{ detail.events_count }}</span>
        </div>
      </div>

      <div>
        <h3 class="mb-2 px-3 text-sm font-semibold text-gray-700">历史日报</h3>
        <Empty v-if="!reports.length" description="暂无历史日报" />
        <CellGroup v-else inset>
          <Cell
            v-for="r in reports"
            :key="r.date"
            :title="r.date"
            :label="shortSummary(r.summary)"
            is-link
            @click="pickDate(r.date)"
          >
            <template #value>
              <span class="text-xs text-gray-400">
                {{ r.todo_done }}/{{ r.todo_done + r.todo_pending }}
              </span>
            </template>
          </Cell>
        </CellGroup>
      </div>
    </div>

    <Popup v-if="!isDesktop" v-model:show="showPicker" position="bottom" round>
      <DatePicker
        v-model="currentDateArr"
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="
          (v) => {
            pickDate(`${v.selectedValues[0]}-${String(v.selectedValues[1]).padStart(2, '0')}-${String(v.selectedValues[2]).padStart(2, '0')}`);
          }
        "
        @cancel="showPicker = false"
      />
    </Popup>

    <Popup v-if="isDesktop" v-model:show="showCalendar" teleport="body" position="center" round>
      <div class="w-[360px] p-4">
        <MonthCalendar
          :model-value="selectedDate"
          :min-date="minDate"
          :max-date="maxDate"
          @update:model-value="onCalendarSelect"
        />
      </div>
    </Popup>
  </div>
</template>
