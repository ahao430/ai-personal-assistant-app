import Database from "@tauri-apps/plugin-sql";
import { BASE_SCHEMA, CHAT_TABLE_DDL, chatTableName } from "./schema";

let dbInstance: Database | null = null;
const ensuredChatTables = new Set<string>();

const DB_FILENAME = "sqlite:assistant.db";

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  dbInstance = await Database.load(DB_FILENAME);
  return dbInstance;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  for (const stmt of BASE_SCHEMA) {
    await db.execute(stmt);
  }
}

/** 确保某天的 chat 表存在（幂等） */
export async function ensureChatTable(date: Date | string): Promise<string> {
  const table = chatTableName(date);
  if (ensuredChatTables.has(table)) return table;
  const db = await getDb();
  await db.execute(CHAT_TABLE_DDL.replace("{table}", table));
  ensuredChatTables.add(table);
  return table;
}
