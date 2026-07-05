<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { domToBlob } from "modern-screenshot";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import AppHeader from "@/components/AppHeader.vue";
import AsyncImage from "@/components/AsyncImage.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";
import { Button, Empty, Icon, showToast } from "vant";
import { useChatStore, TOOL_LABELS, type Attachment, type LocalMessage } from "@/stores/chat";
import { useLlmConfigStore } from "@/stores/llm-config";
import { useChatBackgroundStore } from "@/stores/chat-background";
import { useLayoutMode } from "@/composables/useLayoutMode";

const chat = useChatStore();
const llm = useLlmConfigStore();
const router = useRouter();
const chatBg = useChatBackgroundStore();
const { isDesktop } = useLayoutMode();

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

const bgEnabled = computed(() => chatBg.type !== "none");

const activeImageUrl = computed(
  () => (isDesktop.value ? chatBg.resolvedDesktopUrl : chatBg.resolvedMobileUrl) || ""
);

const bgImageStyle = computed<Record<string, string>>(() => {
  if (chatBg.type !== "image" || !activeImageUrl.value) return {};
  const map: Record<string, string> = {
    "background-image": `url("${activeImageUrl.value}")`,
    opacity: String(Math.max(0, Math.min(1, chatBg.opacity / 100))),
  };
  if (chatBg.blur > 0) map["filter"] = `blur(${chatBg.blur}px)`;
  switch (chatBg.sizeMode) {
    case "cover":
      map["background-size"] = "cover";
      map["background-position"] = "center";
      map["background-repeat"] = "no-repeat";
      break;
    case "contain":
      map["background-size"] = "contain";
      map["background-position"] = "center";
      map["background-repeat"] = "no-repeat";
      break;
    case "stretch":
      map["background-size"] = "100% 100%";
      map["background-position"] = "center";
      map["background-repeat"] = "no-repeat";
      break;
    case "repeat":
      map["background-size"] = "auto";
      map["background-repeat"] = "repeat";
      break;
  }
  return map;
});

const bgColorStyle = computed<Record<string, string>>(() => {
  if (chatBg.type !== "color") return {} as Record<string, string>;
  return {
    "background-color": chatBg.color,
    opacity: String(Math.max(0, Math.min(1, chatBg.opacity / 100))),
  };
});

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

// ============ 选择 / 导出 ============
const selectionMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

const exporting = ref(false);

let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let pointerStart: { x: number; y: number } | null = null;

function isSelectable(m: LocalMessage): boolean {
  return !m.pivot && !m.streaming;
}

function startSelection(messageId: string) {
  selectionMode.value = true;
  selectedIds.value = new Set([messageId]);
}

function toggleSelection(messageId: string) {
  if (!selectionMode.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(messageId)) {
    next.delete(messageId);
  } else {
    next.add(messageId);
  }
  selectedIds.value = next;
}

function exitSelection() {
  selectionMode.value = false;
  selectedIds.value = new Set();
}

function onMessageClick(m: LocalMessage) {
  if (!selectionMode.value) return;
  if (!isSelectable(m)) return;
  toggleSelection(m.id);
}

function onContextMenu(e: MouseEvent, m: LocalMessage) {
  if (!isSelectable(m)) return;
  e.preventDefault();
  if (selectionMode.value) {
    toggleSelection(m.id);
  } else {
    startSelection(m.id);
  }
}

function onPointerDown(e: PointerEvent, m: LocalMessage) {
  if (selectionMode.value) return;
  if (!isSelectable(m)) return;
  if (e.pointerType !== "touch") return;
  pointerStart = { x: e.clientX, y: e.clientY };
  longPressTimer = setTimeout(() => {
    startSelection(m.id);
    pointerStart = null;
    longPressTimer = undefined;
  }, 500);
}

function onPointerMove(e: PointerEvent) {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  if (Math.hypot(dx, dy) > 10) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
    pointerStart = null;
  }
}

function onPointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
  pointerStart = null;
}

function bubbleClasses(m: LocalMessage): string {
  return m.role === "user"
    ? "rounded-br-md bg-brand-500 text-white"
    : "rounded-bl-md bg-white text-gray-900";
}

function buildMarkdown(messages: LocalMessage[]): string {
  return messages.map((m) => {
    const role = m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : m.role;
    let body = m.content;
    if (m.attachments.length) {
      const atts = m.attachments.map((a) => {
        if (a.type === "image") {
          return a.remoteUrl ? `![](${a.remoteUrl})` : `![本地图片]`;
        }
        if (a.type === "tool") {
          const head = `**🔧 ${toolLabel(a.name)}**`;
          const args = `\n\n参数：\n\n\`\`\`json\n${prettyArgs(a.args)}\n\`\`\``;
          const tail = a.result ? `\n\n结果：\n\n${a.result}` : "";
          return head + args + tail;
        }
        if (a.type === "error") return `> ⚠️ ${a.message}`;
        return "";
      }).filter(Boolean).join("\n\n");
      if (atts) body = body + "\n\n" + atts;
    }
    return `## ${role}\n\n${body}`;
  }).join("\n\n---\n\n");
}

async function inlineImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
  if (!imgs.length) return;

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.src;
      if (!src || src.startsWith("data:")) return;

      try {
        const dataUrl = await invoke<string | null>("fetch_as_data_url", { url: src });
        if (!dataUrl) return;
        img.src = dataUrl;
        // 等 data URL 解码完成
        if (img.complete && img.naturalWidth > 0) return;
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, 3000);
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      } catch (e) {
        console.warn("inline image failed:", src, e);
      }
    })
  );
}

async function copyMarkdown() {
  if (!selectedIds.value.size) return;
  const messages = chat.messages.filter((m) => selectedIds.value.has(m.id));
  const md = buildMarkdown(messages);
  try {
    await navigator.clipboard.writeText(md);
    showToast("已复制到剪贴板");
    exitSelection();
  } catch {
    showToast("复制失败");
  }
}

async function exportImage() {
  if (!selectedIds.value.size) return;
  exporting.value = true;
  await nextTick();
  // 等 markdown / KaTeX / mermaid 渲染稳定
  await new Promise((r) => setTimeout(r, 400));

  // 离屏容器：克隆选中消息的真实气泡进来
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;width:600px;padding:24px;background:#f5f5f4;box-sizing:border-box;border-radius:8px;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid #e7e5e4;font-size:12px;color:#78716c;";
  header.innerHTML = `<span style="font-weight:500;">AI 个人助手</span><span>${new Date().toLocaleString("zh-CN")}</span>`;
  container.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  const selected = chat.messages.filter((m) => selectedIds.value.has(m.id));
  for (const m of selected) {
    const rowEl = document.querySelector(`[data-msg-id="${m.id}"]`);
    const bubble = rowEl?.querySelector<HTMLElement>(".chat-bubble");
    if (!bubble) continue;

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex;flex-direction:column;" +
      (m.role === "user" ? "align-items:flex-end;" : "align-items:flex-start;");

    const label = document.createElement("div");
    label.style.cssText = "font-size:11px;color:#9ca3af;margin-bottom:4px;";
    label.textContent = m.role === "user" ? "👤 用户" : "🤖 助手";
    wrapper.appendChild(label);

    const clone = bubble.cloneNode(true) as HTMLElement;
    clone.style.maxWidth = "85%";
    wrapper.appendChild(clone);
    list.appendChild(wrapper);
  }
  container.appendChild(list);
  document.body.appendChild(container);

  // 把所有 img.src 通过 Rust 转成 data URL，绕开浏览器 CORS 限制
  // （html2canvas 读 cross-origin 图片时，服务器没返 ACAO 头就渲染成空白）
  await inlineImages(container);

  try {
    const blob = await domToBlob(container, {
      backgroundColor: "#f5f5f4",
      scale: 2,
    });
    if (!blob) {
      showToast("导出失败");
      return;
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultName = `chat-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!savePath) {
      // 用户取消
      return;
    }
    await writeFile(savePath, buf);
    showToast("已导出");
    exitSelection();
  } catch (e) {
    console.error("Export image failed:", e);
    showToast("导出失败：" + String(e));
  } finally {
    document.body.removeChild(container);
    exporting.value = false;
  }
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
      <div
        v-if="bgEnabled"
        class="pointer-events-none absolute inset-0 z-0"
        :style="chatBg.type === 'image' ? bgImageStyle : bgColorStyle"
      />
      <div ref="scroller" class="relative z-10 h-full overflow-y-auto px-3 py-3">
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
          :data-msg-id="m.id"
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
            class="group flex flex-row gap-2"
          >
          <div
            v-if="selectionMode && isSelectable(m)"
            class="flex items-start pt-2"
            @click.stop="toggleSelection(m.id)"
          >
            <div
              class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 transition"
              :class="selectedIds.has(m.id)
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-300 bg-white'"
            >
              <svg
                v-if="selectedIds.has(m.id)"
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </div>
          <div
            class="flex flex-1 flex-col"
            :class="m.role === 'user' ? 'items-end' : 'items-start'"
          >
          <div
            class="chat-bubble max-w-[80%] cursor-default rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm transition"
            :class="bubbleClasses(m)"
            @click="onMessageClick(m)"
            @contextmenu="onContextMenu($event, m)"
            @pointerdown="onPointerDown($event, m)"
            @pointermove="onPointerMove($event)"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
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
            v-if="!m.streaming && !selectionMode"
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
    </div>

    <div
      v-if="selectionMode"
      class="flex items-center justify-between gap-3 border-t border-gray-100 bg-white p-3"
      :style="{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }"
    >
      <span class="text-sm text-gray-600">已选 {{ selectedIds.size }} 条</span>
      <div class="flex flex-wrap gap-2">
        <Button size="small" :disabled="!selectedIds.size" @click="copyMarkdown">复制 Markdown</Button>
        <Button size="small" type="primary" :disabled="!selectedIds.size" :loading="exporting" @click="exportImage">导出图片</Button>
        <Button size="small" @click="exitSelection">取消</Button>
      </div>
    </div>
    <div
      v-else
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
