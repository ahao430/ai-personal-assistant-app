import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface LlmConfig {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  params?: Record<string, unknown>;
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface StreamChunk {
  delta: string;
  accumulated: string;
  done: boolean;
  error?: string;
}

export interface ChatSendArgs {
  messages: ChatMessage[];
  config: LlmConfig;
  eventName: string;
  timeoutSecs?: number;
  tools?: ToolDefinition[];
}

export interface ChatSendResult {
  content: string;
  toolCalls: ToolCall[];
}

/**
 * 启动一次流式对话。返回值包含最终文本和模型发起的标准工具调用。
 * 调用方应先 listen(onChunk, onError)，再 await 此函数。
 */
export async function chatSend(args: ChatSendArgs): Promise<ChatSendResult | string> {
  return invoke<ChatSendResult | string>("chat_send", { args });
}

/** 从 API 获取可用模型列表 */
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return invoke<string[]>("list_models", { args: { baseUrl, apiKey } });
}

export interface ChunkListener {
  onChunk: (chunk: StreamChunk) => void;
  onError?: (err: string) => void;
}

/** 监听一次性流式事件，返回取消函数 */
export async function listenStream(
  eventName: string,
  handlers: ChunkListener
): Promise<UnlistenFn> {
  let unlisten: UnlistenFn | null = null;
  unlisten = await listen<StreamChunk>(eventName, (event) => {
    const c = event.payload;
    if (c.error) {
      handlers.onError?.(c.error);
      unlisten?.();
      return;
    }
    handlers.onChunk(c);
    if (c.done) {
      unlisten?.();
    }
  });
  return unlisten;
}
