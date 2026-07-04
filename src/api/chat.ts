import { ensureChatTable, getDb } from "@/db";
import type { Role } from "./llm";

export interface ChatMessageRow {
  id: string;
  role: Role;
  content: string;
  model?: string;
  tokens?: number;
  attachments: string; // JSON
  created_at: number;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function appendMessage(
  date: Date,
  msg: Omit<ChatMessageRow, "id" | "created_at" | "attachments"> & {
    attachments?: unknown[];
  }
): Promise<string> {
  const table = await ensureChatTable(date);
  const db = await getDb();
  const id = uuid();
  const created_at = Date.now();
  await db.execute(
    `INSERT INTO ${table} (id, role, content, model, tokens, attachments, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      msg.role,
      msg.content,
      msg.model ?? null,
      msg.tokens ?? null,
      JSON.stringify(msg.attachments ?? []),
      created_at,
    ]
  );
  return id;
}

export async function listMessagesByDate(date: Date): Promise<ChatMessageRow[]> {
  const table = await ensureChatTable(date);
  const db = await getDb();
  return db.select<ChatMessageRow[]>(
    `SELECT * FROM ${table} ORDER BY created_at ASC`
  );
}

/** 列出所有 chat_* 表名（按日期升序） */
export async function listChatDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%' ORDER BY name ASC"
  );
  return rows.map((r) => r.name);
}
