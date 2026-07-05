import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** 获取 app_data_dir 的绝对路径（用于拼接图片完整路径） */
let appDataDirCache: string | null = null;
let platformCache: "android" | "desktop" | null = null;

export async function getAppDataDir(): Promise<string> {
  if (appDataDirCache) return appDataDirCache;
  try {
    appDataDirCache = await invoke<string>("app_data_dir_resolve");
    if (platformCache === null) {
      // Android 私有目录特征：/data/user/0/<pkg>/files 或 /data/data/<pkg>/files
      platformCache = appDataDirCache.startsWith("/data/") ? "android" : "desktop";
    }
    return appDataDirCache;
  } catch {
    // 浏览器环境
    return "";
  }
}

async function isAndroid(): Promise<boolean> {
  if (platformCache) return platformCache === "android";
  if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) {
    platformCache = "android";
    return true;
  }
  // UA 不可靠时（Tauri Android WebView 部分 ROM 下 UA 可能不含 Android），
  // 用 app_data_dir 路径特征兜底判断
  await getAppDataDir();
  return platformCache === "android";
}

/**
 * 把任意绝对文件路径转成可在 `<img>`/`background-image` 中显示的 URL。
 *
 * Android WebView 对 Tauri 的 asset 协议（asset://localhost 或
 * http://asset.localhost）拦截不稳定，所以 Android 上改成调用 Rust 命令
 * 把文件直接读成 data URL 返回。桌面端仍走 convertFileSrc 以避免 IPC 开销。
 *
 * 失败时抛错（不 swallow），调用方可以拿到错误信息展示给用户。
 */
export async function resolveAbsoluteImageUrl(absPath: string): Promise<string> {
  if (!absPath) return "";
  if (/^(https?:|data:|asset:|blob:)/.test(absPath)) return absPath;
  if (await isAndroid()) {
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

