import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/db";
import type { LlmConfig } from "./llm";

export interface DailyReportRow {
  date: string;
  summary: string;
  todo_done: number;
  todo_pending: number;
  events_count: number;
  raw_stats: string;
  created_at: number;
}

export async function listReports(): Promise<DailyReportRow[]> {
  const db = await getDb();
  return db.select<DailyReportRow[]>(
    "SELECT * FROM daily_reports ORDER BY date DESC"
  );
}

export async function getReport(date: string): Promise<DailyReportRow | null> {
  const db = await getDb();
  const rows = await db.select<DailyReportRow[]>(
    "SELECT * FROM daily_reports WHERE date = $1",
    [date]
  );
  return rows[0] ?? null;
}

export async function generateReport(
  date: string,
  config: LlmConfig
): Promise<string> {
  return invoke<string>("generate_report", {
    args: { date, config },
  });
}

export function exportMarkdown(r: DailyReportRow): string {
  return `# ${r.date} 日报

${r.summary}

---

- 完成任务: **${r.todo_done}**
- 待办: **${r.todo_pending}**
- 当日事件: **${r.events_count}**

> 生成于 ${new Date(r.created_at).toLocaleString("zh-CN")}
`;
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
