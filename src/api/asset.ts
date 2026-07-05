import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** 获取 app_data_dir 的绝对路径（用于拼接图片完整路径） */
let appDataDirCache: string | null = null;
let androidCache: boolean | null = null;

export async function getAppDataDir(): Promise<string> {
  if (appDataDirCache) return appDataDirCache;
  try {
    appDataDirCache = await invoke<string>("app_data_dir_resolve");
    return appDataDirCache;
  } catch {
    return "";
  }
}

async function isAndroidPlatform(): Promise<boolean> {
  if (androidCache !== null) return androidCache;
  try {
    androidCache = await invoke<boolean>("is_android");
  } catch {
    androidCache = false;
  }
  return androidCache;
}

/**
 * 把任意绝对文件路径转成可在 `<img>`/`background-image` 中显示的 URL。
 *
 * 桌面端走 convertFileSrc（asset 协议，性能好）；Android 端走 Rust 命令
 * 读文件返回 data URL（WebView 对 asset 协议支持不稳定）。
 * 平台判断用 Rust 编译期 `cfg!(target_os = "android")`，零开销，不依赖 UA。
 *
 * 失败时抛错（不 swallow），调用方可以拿到错误信息展示给用户。
 */
export async function resolveAbsoluteImageUrl(absPath: string): Promise<string> {
  if (!absPath) return "";
  if (/^(https?:|data:|asset:|blob:)/.test(absPath)) return absPath;
  if (await isAndroidPlatform()) {
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

