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

export interface SearchChatMessageRow extends ChatMessageRow {
  date: string;
  table: string;
}

/**
 * 删除/编辑等本地变更时插入一条 sentinel：
 * 让 max(created_at) 自动变大，下次同步 PUSH 整表覆盖远端。
 * 不参与显示，listMessagesByDate / rowTo 都会过滤。
 */
export const CHAT_UPDATED_SENTINEL = "__CHAT_UPDATED__";

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
    id?: string;
  }
): Promise<string> {
  const table = await ensureChatTable(date);
  const db = await getDb();
  const id = msg.id ?? uuid();
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

export async function deleteMessage(date: Date, id: string): Promise<void> {
  const table = await ensureChatTable(date);
  const db = await getDb();
  await db.execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
  // 插入版本戳：让 max(created_at) 自动 bump，下次同步 PUSH 覆盖远端
  await db.execute(
    `INSERT INTO ${table} (id, role, content, model, tokens, attachments, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), "system", CHAT_UPDATED_SENTINEL, "system", 0, "[]", Date.now()]
  );
}

export async function listChatDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%' ORDER BY name ASC"
  );
  return rows.map((r) => r.name);
}

export async function searchMessages(keyword: string): Promise<SearchChatMessageRow[]> {
  const q = keyword.trim();
  if (!q) return [];
  const db = await getDb();
  const tables = await listChatDates();
  const results: SearchChatMessageRow[] = [];
  const pattern = `%${q}%`;
  for (const table of tables) {
    const rows = await db.select<ChatMessageRow[]>(
      `SELECT * FROM ${table}
       WHERE content LIKE $1 AND NOT (role = 'system' AND content IN ($2, $3))
       ORDER BY created_at DESC
       LIMIT 30`,
      [pattern, CHAT_UPDATED_SENTINEL, "__CHAT_CONTEXT_PIVOT__"]
    );
    const date = table.replace("chat_", "");
    results.push(...rows.map((row) => ({ ...row, table, date })));
  }
  return results.sort((a, b) => b.created_at - a.created_at).slice(0, 50);
}
