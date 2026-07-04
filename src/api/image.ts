import { invoke } from "@tauri-apps/api/core";

export interface ImageConfig {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  default_size?: string;
  default_quality?: string;
}

export interface ImageGenArgs {
  prompt: string;
  config: ImageConfig;
  size?: string;
  quality?: string;
  n?: number;
}

export interface ImageGenResult {
  /** 相对 app_data/images 的路径，例如 2026/07/04/xxx.png */
  path: string;
  remoteUrl?: string;
}

export function imageGen(args: ImageGenArgs): Promise<ImageGenResult[]> {
  return invoke<ImageGenResult[]>("image_gen", { args });
}
