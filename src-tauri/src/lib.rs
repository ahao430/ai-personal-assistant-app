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
        .manage(notification::init_state())
        .invoke_handler(tauri::generate_handler![
            greet,
            app_data_dir_resolve,
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
