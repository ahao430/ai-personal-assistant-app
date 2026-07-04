<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import AsyncImage from "@/components/AsyncImage.vue";
import { Button, Empty, Icon, showToast } from "vant";
import { useChatStore } from "@/stores/chat";
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

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <AppHeader title="对话" show-sync />

    <div
      class="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-500"
    >
      <span>
        模型：<span class="font-medium text-gray-900">{{ activeConfigLabel }}</span>
      </span>
      <button class="text-brand-500" @click="router.push('/settings/llm')">切换</button>
    </div>

    <div ref="scroller" class="flex-1 overflow-y-auto px-3 py-3">
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
          class="flex"
          :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
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
            <div v-else class="whitespace-pre-wrap break-words">
              {{ m.content }}
              <span
                v-if="m.streaming"
                class="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle"
              ></span>
            </div>

            <div v-if="m.error" class="mt-1 text-xs text-red-400">{{ m.error }}</div>

            <div v-if="m.attachments.length" class="mt-2 space-y-2">
              <template v-for="(a, i) in m.attachments" :key="i">
                <div
                  v-if="a.type === 'image'"
                  class="overflow-hidden rounded-lg bg-gray-50"
                >
                  <AsyncImage :path="a.path" :remote-url="a.remoteUrl" />
                </div>
                <div v-else-if="a.type === 'error'" class="text-xs text-red-400">
                  画图失败：{{ a.message }}
                </div>
              </template>
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
  </div>
</template>
