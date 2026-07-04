import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { appendMessage, listMessagesByDate, type ChatMessageRow } from "@/api/chat";
import {
  chatSend,
  listenStream,
  type ChatMessage,
  type LlmConfig,
  type StreamChunk,
} from "@/api/llm";
import { imageGen, type ImageGenResult } from "@/api/image";

export type Attachment =
  | { type: "image"; path: string; remoteUrl?: string; width?: number; height?: number }
  | { type: "error"; message: string };

export interface LocalMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** 流式渲染中（已累计但未结束） */
  streaming?: boolean;
  attachments: Attachment[];
  createdAt: number;
  error?: string;
}

const SYSTEM_PROMPT = `你是一位贴心且高效的个人助手。目标是：
1. 帮用户高效处理工作任务（日程、待办、信息整理）
2. 适度关心生活与健康
3. 当用户要求画图 / 生成图片时，回复 [DRAW:提示词]，系统会自动调用画图工具并把结果返回给用户
4. 回答简洁、可执行，避免空话`;

export const useChatStore = defineStore("chat", () => {
  const messages = ref<LocalMessage[]>([]);
  const sending = ref(false);
  /** 当前激活的日期（按天切换） */
  const activeDate = ref<Date>(new Date());

  /** 给 LLM 的 history（包含 system + 当天消息，跳过附件） */
  const historyForApi = computed<ChatMessage[]>(() => {
    const list: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of messages.value) {
      if (m.role === "system") continue;
      if (m.error) continue;
      list.push({ role: m.role, content: m.content });
    }
    return list;
  });

  async function loadDate(date: Date) {
    activeDate.value = date;
    const rows = await listMessagesByDate(date);
    messages.value = rows.map(rowTo);
  }

  async function send(text: string, config: LlmConfig) {
    const trimmed = text.trim();
    if (!trimmed || sending.value) return;
    sending.value = true;

    const userMsg: LocalMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: [],
      createdAt: Date.now(),
    };
    messages.value.push(userMsg);
    await appendMessage(activeDate.value, {
      role: "user",
      content: trimmed,
      model: config.model,
    });

    const assistantMsg: LocalMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
      attachments: [],
      createdAt: Date.now(),
    };
    messages.value.push(assistantMsg);

    const eventName = `llm-chunk-${assistantMsg.id}`;
    let unlisten = await listenStream(eventName, {
      onChunk: (c: StreamChunk) => {
        assistantMsg.content = c.accumulated;
        if (c.done) {
          assistantMsg.streaming = false;
        }
      },
      onError: (err) => {
        assistantMsg.streaming = false;
        assistantMsg.error = err;
      },
    });

    try {
      const finalText = await chatSend({
        messages: historyForApi.value.filter((m) => m.content !== userMsg.content ? true : true),
        config,
        eventName,
      });
      assistantMsg.content = finalText || assistantMsg.content;
      assistantMsg.streaming = false;

      // 持久化
      await appendMessage(activeDate.value, {
        role: "assistant",
        content: assistantMsg.content,
        model: config.model,
      });

      // 画图工具触发：形如 [DRAW:xxx]
      await maybeTriggerDraw(finalText, assistantMsg);
    } catch (e: unknown) {
      assistantMsg.streaming = false;
      assistantMsg.error = String(e);
    } finally {
      unlisten();
      sending.value = false;
    }
  }

  async function maybeTriggerDraw(text: string, target: LocalMessage) {
    const m = text.match(/\[DRAW:([^\]]+)\]/);
    if (!m) return;
    const prompt = m[1].trim();
    // 暂用占位，待 imageConfigStore 注入
    const { useImageConfigStore } = await import("@/stores/image-config");
    const imgStore = useImageConfigStore();
    if (!imgStore.defaultConfig) return;
    try {
      const results: ImageGenResult[] = await imageGen({
        prompt,
        config: imgStore.toApi(imgStore.defaultConfig),
      });
      for (const r of results) {
        target.attachments.push({
          type: "image",
          path: r.path,
          remoteUrl: r.remoteUrl,
        });
      }
    } catch (e) {
      target.attachments.push({ type: "error", message: String(e) });
    }
  }

  return {
    messages,
    sending,
    activeDate,
    historyForApi,
    loadDate,
    send,
  };
});

function rowTo(r: ChatMessageRow): LocalMessage {
  let attachments: Attachment[] = [];
  try {
    const parsed = JSON.parse(r.attachments) as unknown[];
    attachments = (parsed as Attachment[]).filter(Boolean);
  } catch {
    attachments = [];
  }
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    attachments,
    createdAt: r.created_at,
  };
}
