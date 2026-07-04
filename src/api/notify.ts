import { invoke } from "@tauri-apps/api/core";

export interface ScheduleArgs {
  /** 触发时间（毫秒） */
  atMs: number;
  title: string;
  body: string;
  /** 自定义 id，便于取消；空则内部生成 */
  id?: string;
}

export interface CancelArgs {
  id: string;
}

export function scheduleNotification(args: ScheduleArgs): Promise<string> {
  return invoke<string>("schedule_notification", { args });
}

export function cancelNotification(args: CancelArgs): Promise<void> {
  return invoke<void>("cancel_notification", { args });
}

/** 测试用：立即发一条通知 */
export function sendTestNotification(title: string, body: string): Promise<void> {
  return invoke<void>("send_test_notification", { title, body });
}
