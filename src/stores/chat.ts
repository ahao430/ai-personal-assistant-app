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
import { generateReport } from "@/api/report";
import { lookupWeather } from "@/api/weather";

export type Attachment =
  | { type: "image"; path: string; remoteUrl?: string; width?: number; height?: number }
  | { type: "error"; message: string };

type ToolArgs = Record<string, unknown>;

interface ToolCall {
  name: string;
  args: ToolArgs;
}

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
3. 需要操作应用能力时，只输出工具调用，不要解释；工具调用格式为单行：[TOOL:{"name":"工具名","args":{...}}]
4. 可用工具：
- generate_image: 画图/生成图片，参数 {"prompt":"详细画图提示词"}
- lookup_weather: 查天气，参数 {"location":"城市或地点，可选；用户没说地点时留空，由应用请求定位或询问用户","date":"YYYY-MM-DD 可选"}
- add_todo: 添加待办，参数 {"title":"标题","description":"可选","priority":0|1|2,"due_at":"YYYY-MM-DD HH:mm 可选","remind_at":"YYYY-MM-DD HH:mm 可选"}
- create_event: 创建日程，参数 {"title":"标题","start_at":"YYYY-MM-DD HH:mm","end_at":"YYYY-MM-DD HH:mm 可选","all_day":false,"description":"可选","location":"可选"}
- generate_daily_report: 生成日报，参数 {"date":"YYYY-MM-DD"}
5. 回答简洁、可执行，避免空话`;

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
      id: userMsg.id,
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
        messages: historyForApi.value,
        config,
        eventName,
      });
      assistantMsg.content = finalText || assistantMsg.content;
      assistantMsg.streaming = false;

      await runBuiltInTools(assistantMsg.content, trimmed, userMsg.id, assistantMsg, config);

      await appendMessage(activeDate.value, {
        id: assistantMsg.id,
        role: "assistant",
        content: assistantMsg.content,
        model: config.model,
        attachments: assistantMsg.attachments,
      });
    } catch (e: unknown) {
      assistantMsg.streaming = false;
      assistantMsg.error = String(e);
    } finally {
      unlisten();
      sending.value = false;
    }
  }

  async function runBuiltInTools(
    text: string,
    userText: string,
    userMessageId: string,
    target: LocalMessage,
    config: LlmConfig
  ) {
    const calls = extractToolCalls(text);
    const drawPrompt = extractDrawPrompt(text, userText);
    if (!calls.length && drawPrompt) {
      calls.push({ name: "generate_image", args: { prompt: drawPrompt } });
    }
    if (!calls.length) return;

    for (const call of calls) {
      const result = await runToolCall(call, userMessageId, target, config);
      if (result) {
        target.content = stripToolCalls(target.content).trim();
        target.content += `${target.content ? "\n\n" : ""}${result}`;
      }
    }
  }

  async function runToolCall(
    call: ToolCall,
    userMessageId: string,
    target: LocalMessage,
    config: LlmConfig
  ): Promise<string> {
    try {
      switch (call.name) {
        case "generate_image":
          return await runImageTool(call.args, target);
        case "lookup_weather":
          return await runWeatherTool(call.args);
        case "add_todo":
          return await runTodoTool(call.args, userMessageId);
        case "create_event":
          return await runEventTool(call.args);
        case "generate_daily_report":
          return await runReportTool(call.args, config);
        default:
          return `不支持的工具：${call.name}`;
      }
    } catch (e) {
      const message = String(e);
      target.attachments.push({ type: "error", message });
      return `工具调用失败：${message}`;
    }
  }

  async function runImageTool(args: ToolArgs, target: LocalMessage): Promise<string> {
    const prompt = stringArg(args, "prompt");
    if (!prompt) return "画图失败：缺少提示词";
    const { useImageConfigStore } = await import("@/stores/image-config");
    const imgStore = useImageConfigStore();
    await imgStore.reload();
    if (!imgStore.defaultConfig) return "画图失败：请先配置默认画图模型";
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
    return results.length ? "已生成图片。" : "画图没有返回图片。";
  }

  async function runWeatherTool(args: ToolArgs): Promise<string> {
    const location = stringArg(args, "location");
    if (!location) return "请告诉我你要查询哪个城市的天气，或允许应用使用当前位置。";
    const r = await lookupWeather({
      location,
      date: stringArg(args, "date"),
    });
    const extra = r.humidity || r.windSpeed
      ? `，湿度 ${r.humidity}% ，风速 ${r.windSpeed}km/h`
      : "";
    return `${r.location} ${r.date}：${r.condition}，${r.temperature}℃${extra}`;
  }

  async function runTodoTool(args: ToolArgs, userMessageId: string): Promise<string> {
    const title = stringArg(args, "title");
    if (!title) return "添加待办失败：缺少标题";
    const { useTodoStore } = await import("@/stores/todo");
    const store = useTodoStore();
    await store.save({
      title,
      description: stringArg(args, "description") ?? "",
      priority: numberArg(args, "priority") ?? 0,
      due_at: timeArg(args, "due_at"),
      remind_at: timeArg(args, "remind_at"),
      source_chat_id: userMessageId,
    });
    return `已添加待办：${title}`;
  }

  async function runEventTool(args: ToolArgs): Promise<string> {
    const title = stringArg(args, "title");
    const startAt = timeArg(args, "start_at");
    if (!title) return "创建日程失败：缺少标题";
    if (!startAt) return "创建日程失败：缺少开始时间";
    const { useEventStore } = await import("@/stores/event");
    const store = useEventStore();
    await store.save({
      title,
      start_at: startAt,
      end_at: timeArg(args, "end_at"),
      all_day: booleanArg(args, "all_day") ? 1 : 0,
      description: stringArg(args, "description") ?? "",
      location: stringArg(args, "location") ?? "",
      recurrence: stringArg(args, "recurrence") ?? "",
    });
    return `已创建日程：${title}`;
  }

  async function runReportTool(args: ToolArgs, config: LlmConfig): Promise<string> {
    const date = stringArg(args, "date") ?? formatDate(new Date());
    const summary = await generateReport(date, config);
    return `已生成 ${date} 日报。\n${summary}`;
  }

  function extractToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    let index = 0;
    while (index < text.length) {
      const start = text.indexOf("[TOOL:", index);
      if (start < 0) break;
      const jsonStart = text.indexOf("{", start);
      if (jsonStart < 0) break;
      const jsonEnd = findJsonEnd(text, jsonStart);
      if (jsonEnd < 0) {
        index = jsonStart + 1;
        continue;
      }
      try {
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as ToolCall;
        if (parsed?.name && parsed.args) calls.push(parsed);
      } catch {
        // ignore malformed model output
      }
      index = jsonEnd + 1;
    }
    return calls;
  }

  function findJsonEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth === 0) return i;
    }
    return -1;
  }

  function extractDrawPrompt(assistantText: string, userText: string): string | null {
    const m = assistantText.match(/\[\s*DRAW\s*:\s*([\s\S]*?)\s*\]/i);
    if (m?.[1]?.trim()) return m[1].trim();
    if (isDrawRequest(userText)) return stripToolCalls(assistantText).trim() || userText.trim();
    return null;
  }

  function stripToolCalls(text: string): string {
    let out = text;
    while (true) {
      const start = out.indexOf("[TOOL:");
      if (start < 0) break;
      const jsonStart = out.indexOf("{", start);
      if (jsonStart < 0) break;
      const jsonEnd = findJsonEnd(out, jsonStart);
      if (jsonEnd < 0) break;
      const close = out.indexOf("]", jsonEnd);
      out = out.slice(0, start) + out.slice(close >= 0 ? close + 1 : jsonEnd + 1);
    }
    return out.replace(/\[\s*DRAW\s*:\s*[\s\S]*?\s*\]/gi, "");
  }

  function isDrawRequest(text: string): boolean {
    return /(画|绘制|生成|做|出).{0,8}(图|图片|插画|海报|头像|壁纸)|画一张|生成一张|draw|image/i.test(text);
  }

  function stringArg(args: ToolArgs, key: string): string | undefined {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function numberArg(args: ToolArgs, key: string): number | undefined {
    const value = args[key];
    return typeof value === "number" ? value : undefined;
  }

  function booleanArg(args: ToolArgs, key: string): boolean {
    return args[key] === true || args[key] === "true";
  }

  function timeArg(args: ToolArgs, key: string): number | null {
    const value = args[key];
    if (typeof value === "number") return value;
    if (typeof value !== "string" || !value.trim()) return null;
    const time = new Date(value.replace(" ", "T")).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
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
