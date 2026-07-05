#![allow(clippy::needless_return)]

mod db;
mod image;
mod llm;
mod notification;
mod scheduler;
mod sync;

use notification::{cancel_notification, schedule_notification, send_test_notification};
use scheduler::generate_report;
use sync::{signaling::SignalingConfig, sync_now};

#[tauri::command]
fn is_android() -> bool {
    cfg!(target_os = "android")
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn app_data_dir_resolve(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app_data_dir failed: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

/// 把任意图片 URL（远程 http/https / Tauri asset 协议 / 本地绝对路径）转成 data URL，
/// 让 html2canvas 能不带 CORS 限制地渲染，并绕过 Android WebView 对 asset 协议的不稳定拦截。
#[tauri::command]
async fn fetch_as_data_url(url: String) -> Result<Option<String>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    if url.starts_with("data:") {
        return Ok(None);
    }

    let (mime, bytes): (String, Vec<u8>) = if url.starts_with("http://") || url.starts_with("https://") {
        let res = reqwest::get(&url).await.map_err(|e| format!("fetch: {e}"))?;
        let mime = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        let bytes = res.bytes().await.map_err(|e| format!("read: {e}"))?.to_vec();
        (mime, bytes)
    } else {
        // 支持绝对路径，或 asset://localhost/<encoded> / http://asset.localhost/<encoded>
        let path = if url.starts_with('/') {
            url.clone()
        } else {
            extract_asset_path(&url).ok_or_else(|| format!("unsupported url: {}", url))?
        };
        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|e| format!("read file {:?}: {e}", path))?;
        let mime = guess_mime(&path).to_string();
        (mime, bytes)
    };

    let b64 = STANDARD.encode(&bytes);
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

fn extract_asset_path(url: &str) -> Option<String> {
    // macOS/Linux: asset://localhost/<encoded abs path>
    // Windows:     http://asset.localhost/<encoded abs path>
    let marker = "//localhost/";
    let idx = url.find(marker)?;
    let encoded = &url[idx + marker.len()..];
    Some(percent_decode(encoded))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h1 = (bytes[i + 1] as char).to_digit(16);
            let h2 = (bytes[i + 2] as char).to_digit(16);
            if let (Some(d1), Some(d2)) = (h1, h2) {
                out.push((d1 * 16 + d2) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn guess_mime(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".png") {
        "image/png"
    } else if p.ends_with(".jpg") || p.ends_with(".jpeg") {
        "image/jpeg"
    } else if p.ends_with(".webp") {
        "image/webp"
    } else if p.ends_with(".gif") {
        "image/gif"
    } else {
        "application/octet-stream"
    }
}

#[tauri::command]
async fn chat_send(
    app: tauri::AppHandle,
    args: llm::ChatSendArgs,
) -> Result<llm::ChatSendResult, String> {
    llm::run_chat_completion(app, args).await
}

#[tauri::command]
async fn list_models(args: llm::ListModelsArgs) -> Result<Vec<String>, String> {
    llm::list_models(args).await
}

#[tauri::command]
async fn image_gen(
    app: tauri::AppHandle,
    args: image::ImageGenArgs,
) -> Result<Vec<image::ImageGenResult>, String> {
    image::run_image_generation(app, args).await
}

#[tauri::command]
async fn image_edit(
    app: tauri::AppHandle,
    args: image::ImageEditArgs,
) -> Result<Vec<image::ImageGenResult>, String> {
    image::run_image_edit(app, args).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptimizePromptArgs {
    idea: String,
    config: llm::LlmConfig,
}

#[tauri::command]
async fn optimize_image_prompt(args: OptimizePromptArgs) -> Result<String, String> {
    let system = "你是一个画图提示词优化助手。给定用户的简单想法，输出一段详细、富有视觉细节的英文 Stable Diffusion 风格提示词。要求：\n\
1. 只输出最终提示词，不要解释、不要加引号、不要换行\n\
2. 保留用户的核心意图\n\
3. 加入光线、构图、风格、细节描写";
    let body = serde_json::json!({
        "model": args.config.model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": args.idea },
        ],
        "stream": false,
    });
    let base_url = args.config.base_url.trim_end_matches('/').to_string();
    let url = format!("{base_url}/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .bearer_auth(&args.config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM 请求失败: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    let parsed: serde_json::Value = resp.json().await.map_err(|e| format!("解析失败: {e}"))?;
    let content = parsed
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("LLM 返回空")?
        .trim()
        .to_string();
    Ok(content)
}

/// 把用户选的任意图片路径复制到 app_data_dir/images/imported/ 下，
/// 返回**相对路径**（如 `imported/bg_xxx.png`），相对路径会随 sync_images 同步到
/// 其他设备，跨设备通用。
///
/// 注意：Android 上 tauri-plugin-dialog 返回的多是 content:// URI，
/// tokio::fs::read 读不到，需要前端改用 `<input type="file">` + save_image_data_url。
/// 此命令主要服务于桌面端 dialog 选图。
#[tauri::command]
async fn import_user_image(app: tauri::AppHandle, src: String) -> Result<String, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let imported_dir = dir.join("images").join("imported");
    std::fs::create_dir_all(&imported_dir).map_err(|e| format!("mkdir: {e}"))?;

    let lower = src.to_lowercase();
    let ext = if lower.ends_with(".png") {
        "png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "jpg"
    } else if lower.ends_with(".webp") {
        "webp"
    } else if lower.ends_with(".gif") {
        "gif"
    } else if lower.ends_with(".bmp") {
        "bmp"
    } else {
        "png"
    };

    let id = uuid::Uuid::new_v4().simple();
    let filename = format!("bg_{id}.{ext}");
    let dest = imported_dir.join(&filename);

    let bytes = tokio::fs::read(&src)
        .await
        .map_err(|e| format!("read src {:?}: {e}", src))?;

    std::fs::write(&dest, &bytes).map_err(|e| format!("write dest: {e}"))?;

    let rel = dest
        .strip_prefix(dir.join("images"))
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "dest out of images dir".to_string())?;
    Ok(rel.trim_start_matches('/').to_string())
}

/// 把前端传入的 data URL（base64）解码后写入 app_data_dir/images/<sub_dir>/ 下，
/// 返回**相对路径**（如 `imported/bg_xxx.png`）。相对路径会随 sync_images 同步到
/// 其他设备，跨设备通用。
///
/// 用途：Android 上 tauri-plugin-dialog 选图返回 content:// URI，tokio::fs 读不到；
/// 前端改用 `<input type="file">` + FileReader 把图读成 data URL 传过来即可绕开。
#[tauri::command]
async fn save_image_data_url(
    app: tauri::AppHandle,
    data_url: String,
    sub_dir: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let (mime, b64) = data_url
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(","))
        .ok_or_else(|| format!("malformed data url: prefix"))?;
    let (mime_part, _encoding) = mime.split_once(';').unwrap_or((mime, ""));
    let ext = match mime_part {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        _ => "png",
    };

    let bytes = STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("decode base64: {e}"))?;

    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target_dir = dir.join("images").join(if sub_dir.is_empty() { "imported".to_string() } else { sub_dir });
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("mkdir: {e}"))?;

    let id = uuid::Uuid::new_v4().simple();
    let filename = format!("bg_{id}.{ext}");
    let dest = target_dir.join(&filename);
    std::fs::write(&dest, &bytes).map_err(|e| format!("write: {e}"))?;

    // 返回相对路径（相对于 images/）
    let rel = dest
        .strip_prefix(dir.join("images"))
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "dest out of images dir".to_string())?;
    Ok(rel.trim_start_matches('/').to_string())
}

#[tauri::command]
async fn signaling_start(app: tauri::AppHandle, cfg: SignalingConfig) -> Result<(), String> {
    sync::signaling::spawn_signaling_loop(app, cfg);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(notification::init_state())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_android,
            app_data_dir_resolve,
            fetch_as_data_url,
            import_user_image,
            save_image_data_url,
            chat_send,
            list_models,
            image_gen,
            image_edit,
            optimize_image_prompt,
            schedule_notification,
            cancel_notification,
            send_test_notification,
            sync_now,
            signaling_start,
            generate_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
