import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** 获取 app_data_dir 的绝对路径（用于拼接图片完整路径） */
let appDataDirCache: string | null = null;

export async function getAppDataDir(): Promise<string> {
  if (appDataDirCache) return appDataDirCache;
  try {
    appDataDirCache = await invoke<string>("app_data_dir_resolve");
    return appDataDirCache;
  } catch {
    // 浏览器环境
    return "";
  }
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * 把任意绝对文件路径转成可在 `<img>`/`background-image` 中显示的 URL。
 *
 * Android WebView 对 Tauri 的 asset 协议（asset://localhost 或
 * http://asset.localhost）拦截不稳定，所以 Android 上改成调用 Rust 命令
 * 把文件直接读成 data URL 返回。桌面端仍走 convertFileSrc 以避免 IPC 开销。
 */
export async function resolveAbsoluteImageUrl(absPath: string): Promise<string> {
  if (!absPath) return "";
  if (/^(https?:|data:|asset:|blob:)/.test(absPath)) return absPath;
  if (isAndroid()) {
    try {
      const dataUrl = await invoke<string | null>("fetch_as_data_url", { url: absPath });
      if (dataUrl) return dataUrl;
    } catch (e) {
      console.warn("fetch_as_data_url failed:", e);
    }
    return "";
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

