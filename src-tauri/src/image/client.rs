use crate::image::types::{ImageEditArgs, ImageGenArgs};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
struct OpenAiImageRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    n: u32,
    size: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
}

#[derive(Deserialize)]
struct OpenAiImageResponse {
    #[serde(default)]
    data: Vec<OpenAiImageItem>,
}

#[derive(Deserialize)]
struct OpenAiImageItem {
    #[serde(default)]
    b64_json: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenResult {
    /// 本地文件相对路径（相对 app_data 目录）
    pub path: String,
    /// 生成图原始 URL（b64 时为空）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
}

fn image_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("images");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub async fn run_image_generation(
    app: AppHandle,
    args: ImageGenArgs,
) -> Result<Vec<ImageGenResult>, String> {
    let ImageGenArgs {
        prompt,
        config,
        size,
        quality,
        n,
    } = args;

    let size = size.unwrap_or(config.default_size);
    let quality = quality.or(Some(config.default_quality));
    let n = n.unwrap_or(1);

    let base_url = config.base_url.trim_end_matches('/').to_string();
    let url = format!("{}/images/generations", base_url);

    let body = OpenAiImageRequest {
        model: &config.model,
        prompt: &prompt,
        n,
        size: &size,
        quality: quality.as_deref(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .http1_only()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| fmt_reqwest_err("请求失败", &e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let parsed: OpenAiImageResponse = resp.json().await.map_err(|e| format!("解析失败: {e}"))?;

    let dir = image_dir(&app);
    let now = chrono::Utc::now();
    let yyyy = now.format("%Y");
    let mm = now.format("%m");
    let sub_dir = dir.join(format!("{yyyy}/{mm}"));
    std::fs::create_dir_all(&sub_dir).map_err(|e| e.to_string())?;

    let mut results = Vec::with_capacity(parsed.data.len());
    for (i, item) in parsed.data.into_iter().enumerate() {
        let fname = format!(
            "{}_{}_{i}.png",
            now.format("%Y%m%d%H%M%S"),
            uuid::Uuid::new_v4().simple()
        );
        let path = sub_dir.join(&fname);
        let remote_url = item.url.clone();

        if let Some(b64) = item.b64_json {
            use base64_impl as b64;
            let bytes = b64::decode(&b64).map_err(|e| format!("base64 解码失败: {e}"))?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        } else if let Some(remote) = item.url {
            // 没有 b64，下载 URL
            let bytes = client
                .get(&remote)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        } else {
            continue;
        }

        let rel = path
            .strip_prefix(&dir)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        results.push(ImageGenResult {
            path: rel,
            remote_url,
        });
    }

    if results.is_empty() {
        return Err("服务返回空数据".into());
    }
    Ok(results)
}

pub async fn run_image_edit(
    app: AppHandle,
    args: ImageEditArgs,
) -> Result<Vec<ImageGenResult>, String> {
    let ImageEditArgs {
        prompt,
        config,
        image_path,
        size,
        n,
    } = args;

    let size = size.unwrap_or(config.default_size);
    let n = n.unwrap_or(1);

    // 读取参考图
    let image_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("读取参考图失败: {e}"))?;
    let image_filename = std::path::Path::new(&image_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("reference.png")
        .to_string();

    let base_url = config.base_url.trim_end_matches('/').to_string();
    let url = format!("{}/images/edits", base_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .http1_only()
        .build()
        .map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name(image_filename)
        .mime_str("image/png")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("model", config.model.clone())
        .text("prompt", prompt)
        .text("n", n.to_string())
        .text("size", size)
        .part("image", part);

    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| fmt_reqwest_err("请求失败", &e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let parsed: OpenAiImageResponse = resp.json().await.map_err(|e| format!("解析失败: {e}"))?;

    let dir = image_dir(&app);
    let now = chrono::Utc::now();
    let yyyy = now.format("%Y");
    let mm = now.format("%m");
    let sub_dir = dir.join(format!("{yyyy}/{mm}"));
    std::fs::create_dir_all(&sub_dir).map_err(|e| e.to_string())?;

    let mut results = Vec::with_capacity(parsed.data.len());
    for (i, item) in parsed.data.into_iter().enumerate() {
        let fname = format!(
            "{}_{}_{i}.png",
            now.format("%Y%m%d%H%M%S"),
            uuid::Uuid::new_v4().simple()
        );
        let path = sub_dir.join(&fname);
        let remote_url = item.url.clone();

        if let Some(b64) = item.b64_json {
            use base64_impl as b64;
            let bytes = b64::decode(&b64).map_err(|e| format!("base64 解码失败: {e}"))?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        } else if let Some(remote) = item.url {
            let bytes = client
                .get(&remote)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .bytes()
                .await
                .map_err(|e| e.to_string())?;
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        } else {
            continue;
        }

        let rel = path
            .strip_prefix(&dir)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        results.push(ImageGenResult {
            path: rel,
            remote_url,
        });
    }

    if results.is_empty() {
        return Err("服务返回空数据".into());
    }
    Ok(results)
}

fn fmt_reqwest_err(prefix: &str, e: &reqwest::Error) -> String {
    let mut out = format!("{prefix}: {e}");
    let mut src: Option<&dyn std::error::Error> = e.source();
    while let Some(s) = src {
        out.push_str(&format!(" | {s}"));
        src = s.source();
    }
    out
}

/// 内嵌 base64 解码，避免引一个新 crate（用 `base64` 也行，这里手写最小实现）。
mod base64_impl {
    pub fn decode(s: &str) -> Result<Vec<u8>, String> {
        let s: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        let table: [i16; 256] = {
            let mut t = [-1i16; 256];
            for (i, c) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
                .iter()
                .enumerate()
            {
                t[*c as usize] = i as i16;
            }
            t
        };
        let mut out = Vec::with_capacity(s.len() * 3 / 4);
        let mut buf = 0u32;
        let mut bits = 0;
        for c in s.bytes() {
            if c == b'=' {
                break;
            }
            let v = table[c as usize];
            if v < 0 {
                return Err("invalid base64 char".into());
            }
            buf = (buf << 6) | (v as u32);
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push(((buf >> bits) & 0xff) as u8);
            }
        }
        Ok(out)
    }
}
