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

/// 把用户选的任意图片路径复制到 app_data_dir/images/imported/ 下，
/// 返回复制后的绝对路径。用于会话背景图等场景：
/// - 桌面端 convertFileSrc 也能访问任意路径，但统一存放便于管理；
/// - Android 端 tauri-plugin-dialog 选图返回的多是 cache 临时路径，
///   会被系统清理；同时部分机型返回 content:// URI，tokio::fs::read 读不到。
///   复制到 app_data_dir 内可彻底避开这两类问题。
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

    Ok(dest.to_string_lossy().to_string())
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
            app_data_dir_resolve,
            fetch_as_data_url,
            import_user_image,
            chat_send,
            list_models,
            image_gen,
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
