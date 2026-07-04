import { invoke } from "@tauri-apps/api/core";

export interface WebdavConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export interface SignalingConfig {
  url: string;
  deviceId: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  skipped: number;
  errors: string[];
}

export function syncNow(cfg: WebdavConfig): Promise<SyncResult> {
  return invoke<SyncResult>("sync_now", {
    args: {
      baseUrl: cfg.baseUrl,
      username: cfg.username,
      password: cfg.password,
    },
  });
}

export function signalingStart(cfg: SignalingConfig): Promise<void> {
  return invoke<void>("signaling_start", { cfg });
}
