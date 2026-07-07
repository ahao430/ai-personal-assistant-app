import { getDb } from "./index";

/** SQLite 行的通用类型 */
export type Row = Record<string, unknown>;

export interface LlmConfigRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  is_default: number;
  params: string;
  created_at: number;
  updated_at: number;
}

export interface ImageConfigRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  default_size: string;
  default_quality: string;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export type TodoStatus = "pending" | "done" | "archived";

export interface TodoRow {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: number; // 0 普通, 1 重要, 2 紧急
  due_at: number | null;
  remind_at: number | null;
  source_chat_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface EventRow {
  id: string;
  title: string;
  description: string;
  start_at: number;
  end_at: number | null;
  all_day: number;
  location: string;
  recurrence: string;
  created_at: number;
  updated_at: number;
}

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  color: string;
  font: string;
  paper: string;
  created_at: number;
  updated_at: number;
}

function now(): number {
  return Date.now();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + now().toString(36);
}

// ----- LLM 配置 CRUD -----

export async function listLlmConfigs(): Promise<LlmConfigRow[]> {
  const db = await getDb();
  return db.select<LlmConfigRow[]>(
    "SELECT * FROM llm_configs ORDER BY is_default DESC, created_at ASC"
  );
}

export async function getLlmConfig(id: string): Promise<LlmConfigRow | undefined> {
  const db = await getDb();
  const rows = await db.select<LlmConfigRow[]>(
    "SELECT * FROM llm_configs WHERE id = $1 LIMIT 1",
    [id]
  );
  return rows[0];
}

export async function upsertLlmConfig(
  row: Partial<LlmConfigRow> & { name: string; base_url: string; model: string }
): Promise<string> {
  const db = await getDb();
  const id = row.id ?? uuid();
  const ts = now();
  await db.execute(
    `INSERT INTO llm_configs (id, name, base_url, api_key, model, is_default, params, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       base_url=excluded.base_url,
       api_key=excluded.api_key,
       model=excluded.model,
       is_default=excluded.is_default,
       params=excluded.params,
       updated_at=excluded.updated_at`,
    [
      id,
      row.name,
      row.base_url,
      row.api_key ?? "",
      row.model,
      row.is_default ?? 0,
      row.params ?? "{}",
      ts,
      ts,
    ]
  );
  if (row.is_default) {
    await db.execute(
      "UPDATE llm_configs SET is_default = 0 WHERE id != $1",
      [id]
    );
  }
  return id;
}

export async function deleteLlmConfig(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM llm_configs WHERE id = $1", [id]);
}

// ----- 画图配置 CRUD -----

export async function listImageConfigs(): Promise<ImageConfigRow[]> {
  const db = await getDb();
  return db.select<ImageConfigRow[]>(
    "SELECT * FROM image_configs ORDER BY is_default DESC, created_at ASC"
  );
}

export async function getImageConfig(id: string): Promise<ImageConfigRow | undefined> {
  const db = await getDb();
  const rows = await db.select<ImageConfigRow[]>(
    "SELECT * FROM image_configs WHERE id = $1 LIMIT 1",
    [id]
  );
  return rows[0];
}

export async function upsertImageConfig(
  row: Partial<ImageConfigRow> & {
    name: string;
    base_url: string;
    model: string;
  }
): Promise<string> {
  const db = await getDb();
  const id = row.id ?? uuid();
  const ts = now();
  await db.execute(
    `INSERT INTO image_configs (id, name, base_url, api_key, model, default_size, default_quality, is_default, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       base_url=excluded.base_url,
       api_key=excluded.api_key,
       model=excluded.model,
       default_size=excluded.default_size,
       default_quality=excluded.default_quality,
       is_default=excluded.is_default,
       updated_at=excluded.updated_at`,
    [
      id,
      row.name,
      row.base_url,
      row.api_key ?? "",
      row.model,
      row.default_size ?? "1024x1024",
      row.default_quality ?? "medium",
      row.is_default ?? 0,
      ts,
      ts,
    ]
  );
  if (row.is_default) {
    await db.execute(
      "UPDATE image_configs SET is_default = 0 WHERE id != $1",
      [id]
    );
  }
  return id;
}

export async function deleteImageConfig(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM image_configs WHERE id = $1", [id]);
}

// ----- user_prefs（参与同步） -----

export async function getUserPref<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM user_prefs WHERE key = $1 LIMIT 1",
    [key]
  );
  if (!rows[0]?.value) return null;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return null;
  }
}

export async function setUserPref<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  const ts = now();
  await db.execute(
    `INSERT INTO user_prefs (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, JSON.stringify(value), ts]
  );
}

// ----- Todo CRUD -----

export async function listTodos(filter: {
  status?: TodoStatus | "all";
  fromDue?: number;
  toDue?: number;
} = {}): Promise<TodoRow[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== "all") {
    where.push("status = $1");
    params.push(filter.status);
  }
  if (filter.fromDue != null) {
    where.push(`due_at IS NOT NULL AND due_at >= $${params.length + 1}`);
    params.push(filter.fromDue);
  }
  if (filter.toDue != null) {
    where.push(`due_at IS NOT NULL AND due_at <= $${params.length + 1}`);
    params.push(filter.toDue);
  }
  const sql = `SELECT * FROM todos${where.length ? " WHERE " + where.join(" AND ") : ""}
               ORDER BY (status='done') ASC,
                        (due_at IS NULL) ASC, due_at ASC,
                        priority DESC, created_at ASC`;
  return db.select<TodoRow[]>(sql, params);
}

export async function upsertTodo(
  row: Partial<TodoRow> & { title: string }
): Promise<string> {
  const db = await getDb();
  const id = row.id ?? uuid();
  const ts = Date.now();
  await db.execute(
    `INSERT INTO todos (id, title, description, status, priority, due_at, remind_at, source_chat_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       status=excluded.status,
       priority=excluded.priority,
       due_at=excluded.due_at,
       remind_at=excluded.remind_at,
       source_chat_id=excluded.source_chat_id,
       updated_at=excluded.updated_at`,
    [
      id,
      row.title,
      row.description ?? "",
      row.status ?? "pending",
      row.priority ?? 0,
      row.due_at ?? null,
      row.remind_at ?? null,
      row.source_chat_id ?? null,
      row.created_at ?? ts,
      ts,
    ]
  );
  return id;
}

export async function setTodoStatus(id: string, status: TodoStatus): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE todos SET status=$1, updated_at=$2 WHERE id=$3",
    [status, Date.now(), id]
  );
}

export async function deleteTodo(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM todos WHERE id=$1", [id]);
}

// ----- Event CRUD -----

export async function listEventsInRange(
  fromMs: number,
  toMs: number
): Promise<EventRow[]> {
  const db = await getDb();
  return db.select<EventRow[]>(
    `SELECT * FROM events
     WHERE start_at >= $1 AND (end_at IS NULL OR end_at <= $2 OR start_at <= $2)
     ORDER BY start_at ASC, all_day DESC`,
    [fromMs, toMs]
  );
}

export async function listEventsOnDay(date: Date): Promise<EventRow[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const db = await getDb();
  return db.select<EventRow[]>(
    `SELECT * FROM events
     WHERE start_at >= $1 AND start_at <= $2
     ORDER BY all_day DESC, start_at ASC`,
    [start.getTime(), end.getTime()]
  );
}

export async function upsertEvent(
  row: Partial<EventRow> & { title: string; start_at: number }
): Promise<string> {
  const db = await getDb();
  const id = row.id ?? uuid();
  const ts = Date.now();
  await db.execute(
    `INSERT INTO events (id, title, description, start_at, end_at, all_day, location, recurrence, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       start_at=excluded.start_at,
       end_at=excluded.end_at,
       all_day=excluded.all_day,
       location=excluded.location,
       recurrence=excluded.recurrence,
       updated_at=excluded.updated_at`,
    [
      id,
      row.title,
      row.description ?? "",
      row.start_at,
      row.end_at ?? null,
      row.all_day ? 1 : 0,
      row.location ?? "",
      row.recurrence ?? "",
      row.created_at ?? ts,
      ts,
    ]
  );
  return id;
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM events WHERE id=$1", [id]);
}

// ----- Note CRUD -----

export async function listNotes(): Promise<NoteRow[]> {
  const db = await getDb();
  return db.select<NoteRow[]>(
    "SELECT * FROM notes ORDER BY updated_at DESC"
  );
}

export async function searchNotes(keyword: string): Promise<NoteRow[]> {
  const q = keyword.trim();
  if (!q) return [];
  const db = await getDb();
  return db.select<NoteRow[]>(
    `SELECT * FROM notes
     WHERE title LIKE $1 OR content LIKE $1
     ORDER BY updated_at DESC
     LIMIT 50`,
    [`%${q}%`]
  );
}

export async function getNote(id: string): Promise<NoteRow | null> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    "SELECT * FROM notes WHERE id=$1 LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
}

export async function upsertNote(
  row: Partial<NoteRow> & { title: string }
): Promise<string> {
  const db = await getDb();
  const id = row.id ?? uuid();
  const ts = Date.now();
  await db.execute(
    `INSERT INTO notes (id, title, content, color, font, paper, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       content=excluded.content,
       color=excluded.color,
       font=excluded.font,
       paper=excluded.paper,
       updated_at=excluded.updated_at`,
    [
      id,
      row.title,
      row.content ?? "",
      row.color ?? "",
      row.font ?? "",
      row.paper ?? "",
      row.created_at ?? ts,
      ts,
    ]
  );
  return id;
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id=$1", [id]);
}

export async function deleteNotes(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  await db.execute(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
}

