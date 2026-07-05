import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** 获取 app_data_dir 的绝对路径（用于拼接图片完整路径） */
let appDataDirCache: string | null = null;

export async function getAppDataDir(): Promise<string> {
  if (appDataDirCache) return appDataDirCache;
  try {
    appDataDirCache = await invoke<string>("app_data_dir_resolve");
    return appDataDirCache;
  } catch {
    return "";
  }
}

/** 检测是否为桌面平台（macOS / Windows / Linux）。
 *  移动端（Android / iOS）的 WebView 对 Tauri asset 协议支持不稳定，
 *  所以这里**反向检测桌面**：是桌面走 convertFileSrc，非桌面走 data URL。 */
function isDesktopPlatform(): boolean {
  if (typeof navigator === "undefined") return true; // SSR 默认桌面
  const ua = navigator.userAgent;
  // 先排除移动端（Android UA 也含 "Linux"，必须先排除）
  if (/android|iphone|ipad|ipod/i.test(ua)) return false;
  // 桌面 OS 关键字
  if (/macintosh|windows|linux/i.test(ua)) return true;
  // Tauri 桌面（有 __TAURI_INTERNALS__ 且无移动标记）
  if ("__TAURI_INTERNALS__" in window) return true;
  return false;
}

/**
 * 把任意绝对文件路径转成可在 `<img>`/`background-image` 中显示的 URL。
 *
 * 桌面端走 convertFileSrc（asset 协议，性能好）；移动端走 Rust 命令
 * 读文件返回 data URL（WebView 对 asset 协议支持不稳定）。
 *
 * 失败时抛错（不 swallow），调用方可以拿到错误信息展示给用户。
 */
export async function resolveAbsoluteImageUrl(absPath: string): Promise<string> {
  if (!absPath) return "";
  if (/^(https?:|data:|asset:|blob:)/.test(absPath)) return absPath;
  if (!isDesktopPlatform()) {
    const dataUrl = await invoke<string | null>("fetch_as_data_url", { url: absPath });
    if (!dataUrl) throw new Error("Rust 返回空 data URL");
    return dataUrl;
  }
  return convertFileSrc(absPath);
}

/** 把 images/YYYY/MM/xxx.png 转成可在 <img> 显示的 URL */
export async function resolveImageUrl(relPath: string): Promise<string> {
  if (!relPath) return "";
  if (/^https?:/.test(relPath)) return relPath;
  const base = await getAppDataDir();
  if (!base) return relPath;
  const abs = `${base}/images/${relPath}`;
  return resolveAbsoluteImageUrl(abs);
}

