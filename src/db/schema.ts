/**
 * SQLite schema.
 *
 * 聊天按"日期"分表（chat_YYYYMMDD），方便未来按天归档 / 同步。
 * 其余表为单表。
 *
 * 注意：SQLite 不支持 IF NOT EXISTS 与表名占位符结合，分表需要动态拼接 SQL，
 * 在 db.ts 的 ensureChatTable(date) 中处理。
 */

export const BASE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS llm_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    params TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_llm_configs_default ON llm_configs(is_default)`,

  `CREATE TABLE IF NOT EXISTS image_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    default_size TEXT NOT NULL DEFAULT '1024x1024',
    default_quality TEXT NOT NULL DEFAULT 'medium',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER,
    remind_at INTEGER,
    source_chat_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_at)`,

  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_at INTEGER NOT NULL,
    end_at INTEGER,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    recurrence TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at)`,

  `CREATE TABLE IF NOT EXISTS daily_reports (
    date TEXT PRIMARY KEY,
    summary TEXT NOT NULL DEFAULT '',
    todo_done INTEGER NOT NULL DEFAULT 0,
    todo_pending INTEGER NOT NULL DEFAULT 0,
    events_count INTEGER NOT NULL DEFAULT 0,
    raw_stats TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    synced_at INTEGER NOT NULL
  )`,

  // 本地 KV（不参与同步），存 WebDAV / 信令 / 设备 ID 等配置
  `CREATE TABLE IF NOT EXISTS local_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // 数据清洗：之前 Vant Switch 直接 v-model 把 all_day 写成 boolean true/false，
  // 经 tauri-plugin-sql 进 SQLite 后变 TEXT 'true'/'false'，导致 Rust 读 i64 崩。
  // 幂等：INTEGER 1/0 → 1/0，TEXT 'true'/'false' → 1/0。
  `UPDATE events SET all_day = CASE WHEN CAST(all_day AS INTEGER) != 0 THEN 1 ELSE 0 END`,
];

export const CHAT_TABLE_PREFIX = "chat_";

/** 把 Date / Datestring (YYYY-MM-DD) 转成 chat_YYYYMMDD 表名 */
export function chatTableName(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${CHAT_TABLE_PREFIX}${y}${m}${day}`;
}

export const CHAT_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS {table} (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    model TEXT,
    tokens INTEGER,
    attachments TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  )
`;
