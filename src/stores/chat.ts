import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  appendMessage,
  CHAT_UPDATED_SENTINEL,
  deleteMessage,
  listMessagesByDate,
  type ChatMessageRow,
} from "@/api/chat";
import {
  chatSend,
  listenStream,
  type ChatMessage,
  type LlmConfig,
  type StreamChunk,
  type ToolDefinition,
  type ToolCall,
} from "@/api/llm";
import { imageGen, type ImageGenResult } from "@/api/image";
import { generateReport } from "@/api/report";
import {
  describeWeather,
  lookupWeather,
  weatherEmoji,
  type WeatherLookupResult,
} from "@/api/weather";

export type Attachment =
  | { type: "image"; path: string; remoteUrl?: string; width?: number; height?: number }
  | { type: "error"; message: string }
  | {
      type: "tool";
      name: string;
      args: Record<string, unknown>;
      status: "running" | "done" | "error";
      result?: string;
      error?: string;
    };

export const TOOL_LABELS: Record<string, string> = {
  generate_image: "生成图片",
  lookup_weather: "查询天气",
  add_todo: "添加待办",
  create_event: "创建日程",
  generate_daily_report: "生成日报",
};

export const PIVOT_SENTINEL = "__CHAT_CONTEXT_PIVOT__";

export interface LocalMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** 流式渲染中（已累计但未结束） */
  streaming?: boolean;
  /** 标记为新话题分隔点（之前的消息不参与后续 LLM 上下文） */
  pivot?: boolean;
  attachments: Attachment[];
  createdAt: number;
  error?: string;
}

const SYSTEM_PROMPT = `你是一位贴心且高效的个人助手。目标是：
1. 帮用户高效处理工作任务（日程、待办、信息整理）
2. 适度关心生活与健康
3. 需要操作应用能力时，优先使用系统提供的工具；工具由本地应用执行（写入本地数据库、调用本地画图代理等）
4. 回答简洁、可执行，避免空话`;

const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "根据用户需求生成图片，并在会话中展示结果。由本地画图代理执行。",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "详细画图提示词" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_weather",
      description: "查询指定城市或地点的天气；用户没说地点时传空 location，让应用询问或请求定位。",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "城市或地点，可为空字符串" },
          date: { type: "string", description: "YYYY-MM-DD，可选" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_todo",
      description: "添加待办事项。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "number", enum: [0, 1, 2] },
          due_at: { type: "string", description: "YYYY-MM-DD HH:mm，可选" },
          remind_at: { type: "string", description: "YYYY-MM-DD HH:mm，可选" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "创建日程。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start_at: { type: "string", description: "YYYY-MM-DD HH:mm" },
          end_at: { type: "string", description: "YYYY-MM-DD HH:mm，可选" },
          all_day: { type: "boolean" },
          description: { type: "string" },
          location: { type: "string" },
        },
        required: ["title", "start_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_daily_report",
      description: "生成指定日期的日报；不传 date 默认今天。",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD，可选" },
        },
        required: [],
      },
    },
  },
];

export const useChatStore = defineStore("chat", () => {
  const messages = ref<LocalMessage[]>([]);
  const sending = ref(false);
  /** 当前激活的日期（按天切换） */
  const activeDate = ref<Date>(new Date());

  /** 给 LLM 的 history（包含 system + 最近一个 pivot 之后的消息） */
  const historyForApi = computed<ChatMessage[]>(() => {
    const list: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    const msgs = messages.value;
    let start = 0;
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].pivot) start = i + 1;
    }
    for (const m of msgs.slice(start)) {
      if (m.role === "system") continue;
      if (m.error) continue;
      list.push({ role: m.role, content: m.content });
    }
    return list;
  });

  async function startNewContext() {
    if (sending.value) return;
    const pivot: LocalMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: PIVOT_SENTINEL,
      pivot: true,
      attachments: [],
      createdAt: Date.now(),
    };
    messages.value.push(pivot);
    await appendMessage(activeDate.value, {
      id: pivot.id,
      role: "system",
      content: PIVOT_SENTINEL,
      model: "system",
    });
  }

  async function loadDate(date: Date) {
    activeDate.value = date;
    const rows = await listMessagesByDate(date);
    messages.value = rows
      .filter((r) => !(r.role === "system" && r.content === CHAT_UPDATED_SENTINEL))
      .map(rowTo);
  }

  async function removeMessage(id: string) {
    const target = messages.value.find((m) => m.id === id);
    if (!target) return;
    await deleteMessage(activeDate.value, id);
    messages.value = messages.value.filter((m) => m.id !== id);
  }

  function findPairUserContent(assistantId: string): string | null {
    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx < 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m.pivot) break;
      if (m.role === "user") return m.content;
    }
    return null;
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
      const response = await chatSend({
        messages: historyForApi.value,
        config,
        eventName,
        tools: BUILT_IN_TOOLS,
      });
      const result = normalizeChatResult(response);
      assistantMsg.content = result.content || assistantMsg.content;
      assistantMsg.streaming = false;

      await runBuiltInTools(result.toolCalls, assistantMsg.content, trimmed, userMsg.id, assistantMsg, config);

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

  function normalizeChatResult(response: Awaited<ReturnType<typeof chatSend>>): {
    content: string;
    toolCalls: ToolCall[];
  } {
    if (typeof response === "string") return { content: response, toolCalls: [] };
    return {
      content: typeof response.content === "string" ? response.content : "",
      toolCalls: Array.isArray(response.toolCalls) ? response.toolCalls : [],
    };
  }

  async function runBuiltInTools(
    toolCalls: ToolCall[],
    text: string,
    userText: string,
    userMessageId: string,
    target: LocalMessage,
    config: LlmConfig
  ) {
    const assistantText = typeof text === "string" ? text : "";
    const calls = toolCalls.length ? [...toolCalls] : extractToolCalls(assistantText);
    const drawPrompt = extractDrawPrompt(assistantText, userText);
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
    const entry: Extract<Attachment, { type: "tool" }> = {
      type: "tool",
      name: call.name,
      args: call.args ?? {},
      status: "running",
    };
    target.attachments.push(entry);

    try {
      let result: string;
      switch (call.name) {
        case "generate_image":
          result = await runImageTool(call.args, target);
          break;
        case "lookup_weather":
          result = await runWeatherTool(call.args);
          break;
        case "add_todo":
          result = await runTodoTool(call.args, userMessageId);
          break;
        case "create_event":
          result = await runEventTool(call.args);
          break;
        case "generate_daily_report":
          result = await runReportTool(call.args, config);
          break;
        default:
          result = `不支持的工具：${call.name}`;
      }
      entry.status = "done";
      entry.result = result;
      return result;
    } catch (e) {
      const message = String(e);
      entry.status = "error";
      entry.error = message;
      return `工具调用失败：${message}`;
    }
  }

  async function runImageTool(args: Record<string, unknown>, target: LocalMessage): Promise<string> {
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

  async function runWeatherTool(args: Record<string, unknown>): Promise<string> {
    let location = stringArg(args, "location");
    if (!location) {
      const { useWeatherSettingsStore } = await import("@/stores/weather-settings");
      const w = useWeatherSettingsStore();
      await w.load();
      if (w.city) location = w.city;
    }
    if (!location) return "请告诉我你要查询哪个城市的天气，或在「我的 → 天气工具」中配置默认城市。";
    const r = await lookupWeather({
      location,
      date: stringArg(args, "date"),
    });
    return formatWeatherMarkdown(r);
  }

  async function runTodoTool(args: Record<string, unknown>, userMessageId: string): Promise<string> {
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

  async function runEventTool(args: Record<string, unknown>): Promise<string> {
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

  async function runReportTool(args: Record<string, unknown>, config: LlmConfig): Promise<string> {
    const date = stringArg(args, "date") ?? formatDate(new Date());
    const summary = await generateReport(date, config);
    return `已生成 ${date} 日报。\n${summary}`;
  }

  function extractToolCalls(text: string): ToolCall[] {
    if (!text) return [];
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
    const safeAssistantText = typeof assistantText === "string" ? assistantText : "";
    const m = safeAssistantText.match(/\[\s*DRAW\s*:\s*([\s\S]*?)\s*\]/i);
    if (m?.[1]?.trim()) return m[1].trim();
    if (isDrawRequest(userText)) return stripToolCalls(safeAssistantText).trim() || userText.trim();
    return null;
  }

  function stripToolCalls(text: string): string {
    let out = typeof text === "string" ? text : "";
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

  function stringArg(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function numberArg(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key];
    return typeof value === "number" ? value : undefined;
  }

  function booleanArg(args: Record<string, unknown>, key: string): boolean {
    return args[key] === true || args[key] === "true";
  }

  function timeArg(args: Record<string, unknown>, key: string): number | null {
    const value = args[key];
    if (typeof value === "number") return value;
    if (typeof value !== "string" || !value.trim()) return null;
    const time = new Date(value.replace(" ", "T")).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  function formatWeatherMarkdown(r: WeatherLookupResult): string {
    const lines: string[] = [];
    const emoji = weatherEmoji(r.conditionCode, !r.isSpecifiedDay);
    lines.push(`#### ${emoji} ${r.location}`);
    lines.push(`**${r.date} · ${r.condition} · ${r.temperature}℃**（体感 ${r.apparentTemperature}℃）`);

    const facts: string[] = [];
    if (!r.isSpecifiedDay) {
      if (r.humidity) facts.push(`湿度 ${r.humidity}%`);
      if (r.windSpeed) facts.push(`风速 ${r.windSpeed} km/h`);
      if (r.precipitation) facts.push(`降水 ${r.precipitation} mm`);
      if (r.cloudCover != null) facts.push(`云量 ${r.cloudCover}%`);
      if (r.pressure != null) facts.push(`气压 ${Math.round(r.pressure)} hPa`);
    }
    if (r.uvIndex != null) facts.push(`紫外线 ${r.uvIndex.toFixed(1)}`);
    if (r.sunrise && r.sunset) facts.push(`日出 ${r.sunrise} · 日落 ${r.sunset}`);
    if (facts.length) {
      lines.push("");
      lines.push(facts.join(" · "));
    }

    lines.push("");
    lines.push(`> 🧥 穿衣建议：${r.clothingIndex}`);

    if (r.hourly.length) {
      lines.push("");
      lines.push(`**未来 ${r.hourly.length} 小时**`);
      lines.push("");
      lines.push("| 时段 | 天气 | 温度 | 降水概率 |");
      lines.push("| --- | --- | --- | --- |");
      const step = r.hourly.length > 12 ? Math.ceil(r.hourly.length / 8) : 1;
      for (let i = 0; i < r.hourly.length; i += step) {
        const h = r.hourly[i];
        lines.push(
          `| ${h.time} | ${weatherEmoji(h.conditionCode)} ${h.condition} | ${h.temperature}℃ | ${h.precipitationProbability}% |`
        );
      }
    }

    if (r.daily.length) {
      lines.push("");
      lines.push(`**未来 ${r.daily.length} 天**`);
      lines.push("");
      lines.push("| 日期 | 天气 | 最高 | 最低 | 降水 |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const d of r.daily) {
        const label = d.date.slice(5);
        lines.push(
          `| ${label} | ${weatherEmoji(d.conditionCode)} ${describeWeather(d.conditionCode)} | ${d.tempMax}℃ | ${d.tempMin}℃ | ${d.precipitationProbability}% |`
        );
      }
    }

    return lines.join("\n");
  }

  return {
    messages,
    sending,
    activeDate,
    historyForApi,
    loadDate,
    send,
    startNewContext,
    removeMessage,
    findPairUserContent,
  };
});

function rowTo(r: ChatMessageRow): LocalMessage {
  const isPivot = r.role === "system" && r.content === PIVOT_SENTINEL;
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
    content: isPivot ? "" : r.content,
    pivot: isPivot,
    attachments,
    createdAt: r.created_at,
  };
}
