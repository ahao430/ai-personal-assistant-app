import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";

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

/** 把 images/YYYY/MM/xxx.png 转成可在 <img> 显示的 URL */
export async function resolveImageUrl(relPath: string): Promise<string> {
  if (!relPath) return "";
  if (/^https?:/.test(relPath)) return relPath;
  const base = await getAppDataDir();
  if (!base) return relPath;
  const abs = `${base}/images/${relPath}`;
  return convertFileSrc(abs);
}
