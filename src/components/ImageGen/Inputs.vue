<script setup lang="ts">
import { PropType } from "vue";
import AsyncImage from "@/components/AsyncImage.vue";
import { Button } from "vant";

const ASPECTS: { key: string; label: string }[] = [
  { key: "1:1", label: "1:1" },
  { key: "4:3", label: "4:3" },
  { key: "3:4", label: "3:4" },
  { key: "16:9", label: "16:9" },
  { key: "9:16", label: "9:16" },
  { key: "3:2", label: "3:2" },
  { key: "2:3", label: "2:3" },
];

defineProps({
  selectedConfigId: { type: String as PropType<string | null>, default: null },
  idea: { type: String, default: "" },
  prompt: { type: String, default: "" },
  showOptions: { type: Boolean, default: false },
  count: { type: Number, default: 1 },
  quality: { type: String, default: "standard" },
  aspect: { type: String, default: "1:1" },
  refImagePath: { type: String, default: "" },
  optimizing: { type: Boolean, default: false },
  generating: { type: Boolean, default: false },
  configs: { type: Array as PropType<{ id: string; name: string }[]>, default: () => [] },
});

const emit = defineEmits<{
  (e: "update:selected-config-id", v: string): void;
  (e: "update:idea", v: string): void;
  (e: "update:prompt", v: string): void;
  (e: "update:show-options", v: boolean): void;
  (e: "update:count", v: number): void;
  (e: "update:quality", v: string): void;
  (e: "update:aspect", v: string): void;
  (e: "optimize"): void;
  (e: "pick-ref"): void;
  (e: "clear-ref"): void;
  (e: "generate"): void;
}>();
</script>

<template>
  <div class="space-y-3">
    <!-- 画图模型 -->
    <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
      <label class="mb-1.5 block text-xs font-medium text-stone-500">画图模型</label>
      <select
        class="w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-sm text-stone-900 focus:border-brand-400 focus:outline-none"
        :value="selectedConfigId ?? ''"
        @change="(e) => emit('update:selected-config-id', (e.target as HTMLSelectElement).value)"
      >
        <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <!-- 你的想法 -->
    <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
      <label class="mb-1.5 block text-xs font-medium text-stone-500">你的想法</label>
      <textarea
        class="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        rows="2"
        placeholder="写一段简单的描述…"
        :value="idea"
        @input="(e) => emit('update:idea', (e.target as HTMLTextAreaElement).value)"
      />
      <button
        class="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition active:scale-95 disabled:opacity-50"
        :disabled="optimizing"
        @click="emit('optimize')"
      >
        {{ optimizing ? "优化中…" : "✨ 优化提示词" }}
      </button>
    </div>

    <!-- 提示词 -->
    <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
      <label class="mb-1.5 block text-xs font-medium text-stone-500">提示词（可手动编辑）</label>
      <textarea
        class="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        rows="4"
        placeholder="详细提示词…"
        :value="prompt"
        @input="(e) => emit('update:prompt', (e.target as HTMLTextAreaElement).value)"
      />
    </div>

    <!-- 更多选项（可折叠） -->
    <div class="rounded-2xl bg-white shadow-card ring-1 ring-stone-100">
      <button
        class="flex w-full items-center justify-between px-3 py-3 text-sm text-stone-700"
        @click="emit('update:show-options', !showOptions)"
      >
        <span>更多选项</span>
        <svg
          class="h-4 w-4 text-stone-400 transition-transform"
          :class="{ 'rotate-180': showOptions }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div v-if="showOptions" class="space-y-3 border-t border-stone-100 p-3">
        <!-- 生成数量 -->
        <div>
          <div class="mb-1.5 text-xs text-stone-500">生成数量</div>
          <div class="flex gap-1.5">
            <button
              v-for="n in [1, 2, 3, 4]"
              :key="n"
              class="flex-1 rounded-lg py-1.5 text-xs transition"
              :class="count === n ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'"
              @click="emit('update:count', n)"
            >
              {{ n }}
            </button>
          </div>
        </div>
        <!-- 分辨率 -->
        <div>
          <div class="mb-1.5 text-xs text-stone-500">分辨率</div>
          <div class="flex gap-1.5">
            <button
              v-for="q in [{ v: 'standard', l: '标准' }, { v: 'hd', l: 'HD' }]"
              :key="q.v"
              class="flex-1 rounded-lg py-1.5 text-xs transition"
              :class="quality === q.v ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'"
              @click="emit('update:quality', q.v)"
            >
              {{ q.l }}
            </button>
          </div>
        </div>
        <!-- 宽高比 -->
        <div>
          <div class="mb-1.5 text-xs text-stone-500">宽高比</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="a in ASPECTS"
              :key="a.key"
              class="rounded-lg px-3 py-1.5 text-xs transition"
              :class="aspect === a.key ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'"
              @click="emit('update:aspect', a.key)"
            >
              {{ a.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 参考图 -->
    <div class="rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100">
      <div class="mb-2 flex items-center justify-between">
        <div class="text-xs font-medium text-stone-500">参考图（可选）</div>
        <button v-if="refImagePath" class="text-xs text-red-500" @click="emit('clear-ref')">移除</button>
      </div>
      <div v-if="refImagePath" class="flex items-center gap-3">
        <AsyncImage :path="refImagePath" :previewable="false" />
        <button class="text-xs text-brand-600" @click="emit('pick-ref')">更换</button>
      </div>
      <button
        v-else
        class="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-xs text-stone-500 transition active:bg-stone-50"
        @click="emit('pick-ref')"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-4-7 6" />
        </svg>
        <span>选择图片</span>
      </button>
    </div>

    <!-- 生成按钮 -->
    <Button
      block
      type="primary"
      round
      :loading="generating"
      @click="emit('generate')"
    >
      {{ generating ? "生成中…" : "生成图片" }}
    </Button>
  </div>
</template>
