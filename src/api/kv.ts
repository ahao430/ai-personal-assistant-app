import { getDb } from "@/db";

/** 本地 KV（不参与同步） */
export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM local_kv WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO local_kv (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [key, value]
  );
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(value));
}

export const KV_KEYS = {
  webdav: "webdav_config",
  signaling: "signaling_config",
  deviceId: "device_id",
  weather: "weather_settings",
} as const;
