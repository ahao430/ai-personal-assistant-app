<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import AsyncImage from "@/components/AsyncImage.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";
import { Button, Empty, Icon, showToast } from "vant";
import { useChatStore, TOOL_LABELS, type Attachment } from "@/stores/chat";
import { useLlmConfigStore } from "@/stores/llm-config";

const chat = useChatStore();
const llm = useLlmConfigStore();
const router = useRouter();

const input = ref("");
const scroller = ref<HTMLElement | null>(null);

const quickPrompts = [
  "今天适合做什么运动？",
  "帮我安排明天的两个会议",
  "用一句话总结我的待办",
];

onMounted(async () => {
  await Promise.all([llm.reload(), chat.loadDate(new Date())]);
  await nextTick(scrollToBottom);
});

watch(
  () => chat.messages.length,
  () => nextTick(scrollToBottom)
);

watch(
  () => chat.messages.map((m) => m.content).join("|"),
  () => nextTick(scrollToBottom)
);

function scrollToBottom() {
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

const canSend = computed(
  () => !!input.value.trim() && !chat.sending && !!llm.defaultConfig
);

const activeConfigLabel = computed(() => llm.defaultConfig?.name ?? "未配置");

async function send(text?: string) {
  const content = (text ?? input.value).trim();
  if (!content) return;
  if (!llm.defaultConfig) {
    showToast("请先配置大模型");
    router.push("/settings/llm");
    return;
  }
  input.value = "";
  await chat.send(content, llm.toApi(llm.defaultConfig));
}

async function remove(m: { id: string }) {
  await chat.removeMessage(m.id);
}

function resend(m: { id: string; role: string; content: string }) {
  if (chat.sending) return;
  let text = m.content;
  if (m.role === "assistant") {
    const pair = chat.findPairUserContent(m.id);
    if (!pair) {
      showToast("未找到对应的问题");
      return;
    }
    text = pair;
  }
  if (!text.trim() || !llm.defaultConfig) {
    if (!llm.defaultConfig) {
      showToast("请先配置大模型");
      router.push("/settings/llm");
    }
    return;
  }
  send(text);
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    send();
  }
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

function isTool(a: Attachment): a is Extract<Attachment, { type: "tool" }> {
  return a.type === "tool";
}

function isImage(a: Attachment): a is Extract<Attachment, { type: "image" }> {
  return a.type === "image";
}

function isError(a: Attachment): a is Extract<Attachment, { type: "error" }> {
  return a.type === "error";
}

function prettyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

const previewSrc = ref("");
const previewVisible = ref(false);

function openPreview(src: string) {
  if (!src) return;
  previewSrc.value = src;
  previewVisible.value = true;
}

function closePreview() {
  previewVisible.value = false;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <AppHeader title="对话" show-sync>
      <template #title-suffix>
        <div class="info-wrap">
          <span class="info-trigger" role="img" aria-label="助理能力提示">ⓘ</span>
          <div class="info-popup" role="tooltip">
            <div class="tooltip-title">助理能力</div>
            <div class="tooltip-row"><span class="cap-icon">🎨</span><span>说"画一个…"直接调用画图模型生成图片</span></div>
            <div class="tooltip-row"><span class="cap-icon">🌤️</span><span>问天气会自动定位或询问城市</span></div>
            <div class="tooltip-row"><span class="cap-icon">📝</span><span>"添加待办 …"自动写入待办列表</span></div>
            <div class="tooltip-row"><span class="cap-icon">📅</span><span>"创建日程 …"自动写入日历</span></div>
            <div class="tooltip-row"><span class="cap-icon">📊</span><span>"生成今日日报"自动汇总当日数据</span></div>
            <div class="tooltip-foot">这些工具由本地应用执行，不需要授权外部服务。</div>
            <div class="tooltip-note">※ 文本模型需支持工具调用（tool calling）。</div>
          </div>
        </div>
      </template>
    </AppHeader>

    <div
      class="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-500"
    >
      <div class="flex items-center gap-1.5">
        <span>
          模型：<span class="font-medium text-gray-900">{{ activeConfigLabel }}</span>
        </span>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="text-gray-500 hover:text-brand-500"
          :disabled="chat.sending"
          @click="chat.startNewContext()"
        >
          新话题
        </button>
        <button class="text-brand-500" @click="router.push('/settings/llm')">切换</button>
      </div>
    </div>

    <div class="relative flex-1 overflow-hidden">
      <div ref="scroller" class="h-full overflow-y-auto px-3 py-3">
      <Empty v-if="!chat.messages.length" description="开始新的对话" class="mt-20">
        <div class="mt-3 flex flex-wrap justify-center gap-2">
          <button
            v-for="p in quickPrompts"
            :key="p"
            class="rounded-full bg-white px-3 py-1 text-xs text-gray-600 shadow-sm active:bg-brand-50"
            @click="send(p)"
          >
            {{ p }}
          </button>
        </div>
      </Empty>

      <div v-else class="space-y-3">
        <div
          v-for="m in chat.messages"
          :key="m.id"
        >
          <div
            v-if="m.pivot"
            class="my-3 flex items-center gap-2 text-xs text-gray-400"
          >
            <span class="h-px flex-1 bg-gray-200"></span>
            <span>新话题 · 此处之前的消息不进入新上下文</span>
            <span class="h-px flex-1 bg-gray-200"></span>
          </div>
          <div
            v-else
            class="group flex flex-col"
            :class="m.role === 'user' ? 'items-end' : 'items-start'"
          >
          <div
            class="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm"
            :class="
              m.role === 'user'
                ? 'rounded-br-md bg-brand-500 text-white'
                : 'rounded-bl-md bg-white text-gray-900'
            "
          >
            <div v-if="!m.content && m.streaming" class="flex items-center gap-1 text-gray-400">
              <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-300"></span>
              <span
                class="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-300"
                style="animation-delay: 0.2s"
              ></span>
              <span
                class="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-300"
                style="animation-delay: 0.4s"
              ></span>
            </div>
            <div v-else class="break-words">
              <div v-if="m.role === 'user'" class="whitespace-pre-wrap">{{ m.content }}</div>
              <MarkdownRenderer v-else :content="m.content" />
              <span
                v-if="m.streaming"
                class="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle"
              ></span>
            </div>

            <div v-if="m.error" class="mt-1 text-xs text-red-400">{{ m.error }}</div>

            <div v-if="m.attachments.length" class="mt-2 space-y-2">
              <template v-for="(a, i) in m.attachments" :key="i">
                <details
                  v-if="isTool(a)"
                  class="rounded-lg border border-gray-200 bg-gray-50/80 text-xs"
                >
                  <summary class="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-gray-700">
                    <span class="text-base leading-none">{{ a.status === 'running' ? '⏳' : a.status === 'error' ? '⚠️' : '🔧' }}</span>
                    <span class="font-medium">{{ toolLabel(a.name) }}</span>
                    <span
                      v-if="a.status === 'running'"
                      class="text-gray-400"
                    >调用中…</span>
                    <span
                      v-else-if="a.status === 'error'"
                      class="text-red-500"
                    >失败</span>
                  </summary>
                  <div class="border-t border-gray-200 px-2 py-1.5 text-gray-600">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400">参数</div>
                    <pre class="mt-0.5 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-snug">{{ prettyArgs(a.args) }}</pre>
                    <template v-if="a.status === 'done' && a.result">
                      <div class="mt-1.5 text-[10px] uppercase tracking-wide text-gray-400">结果</div>
                      <div class="mt-0.5 text-[11px] leading-snug weather-result">
                        <MarkdownRenderer :content="a.result" />
                      </div>
                    </template>
                    <template v-if="a.status === 'error' && a.error">
                      <div class="mt-1.5 text-[10px] uppercase tracking-wide text-red-400">错误</div>
                      <div class="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-red-500">{{ a.error }}</div>
                    </template>
                  </div>
                </details>
                <div
                  v-else-if="isImage(a)"
                  class="overflow-hidden rounded-lg bg-gray-50"
                >
                  <AsyncImage
                    :path="a.path"
                    :remote-url="a.remoteUrl"
                    previewable
                    @preview="openPreview"
                  />
                </div>
                <div v-else-if="isError(a)" class="text-xs text-red-400">
                  画图失败：{{ a.message }}
                </div>
              </template>
            </div>
          </div>
          <div
            v-if="!m.streaming"
            class="mt-1 flex gap-3 px-1 text-xs text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            <button class="hover:text-brand-500" @click="resend(m)">重新发送</button>
            <button class="hover:text-red-500" @click="remove(m)">删除</button>
          </div>
          </div>
        </div>
      </div>
    </div>
    </div>

    <div
      class="border-t border-gray-100 bg-white p-2"
      :style="{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }"
    >
      <div class="flex items-end gap-2">
        <textarea
          v-model="input"
          rows="1"
          placeholder="输入消息，Cmd/Ctrl+Enter 发送"
          class="max-h-[120px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-brand-400 focus:bg-white focus:outline-none"
          @keydown="onKeydown"
        />
        <Button
          type="primary"
          size="small"
          :disabled="!canSend"
          :loading="chat.sending"
          class="!rounded-full"
          @click="send()"
        >
          <Icon name="upgrade" />
        </Button>
      </div>
    </div>

    <ImagePreview :src="previewSrc" :visible="previewVisible" @close="closePreview" />
  </div>
</template>

<style scoped>
.info-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e0e7ff;
  color: #4f46e5;
  font-size: 11px;
  line-height: 1;
  cursor: help;
  user-select: none;
  transition: background 0.15s ease;
}

.info-wrap {
  position: relative;
  display: inline-flex;
}

.info-popup {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  transform: translateY(-4px);
  width: min(280px, 80vw);
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  font-size: 12px;
  line-height: 1.55;
  color: #334155;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  z-index: 100;
  pointer-events: none;
}

.info-popup::before {
  content: "";
  position: absolute;
  top: -5px;
  left: 6px;
  transform: rotate(45deg);
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  border-top: 1px solid #e2e8f0;
}

.info-wrap:hover .info-popup,
.info-trigger:focus + .info-popup {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}

.tooltip-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

.cap-icon {
  flex-shrink: 0;
  width: 16px;
  line-height: 1.55;
}

.tooltip-foot {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
}

.tooltip-note {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}
</style>
