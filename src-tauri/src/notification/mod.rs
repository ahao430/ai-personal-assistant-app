//! 本地通知 + 定时提醒
//!
//! 桌面端通过 tauri-plugin-notification 直接弹出系统通知；
//! Android 端 plugin 内部已对接系统 NotificationManager，前台服务保活
//! 需在 AndroidManifest 中声明 FOREGROUND_SERVICE 权限（M3 TODO）。

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleArgs {
    pub at_ms: i64,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelArgs {
    pub id: String,
}

#[derive(Default)]
pub struct NotificationState {
    handles: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[tauri::command]
pub async fn schedule_notification(
    app: AppHandle,
    state: State<'_, NotificationState>,
    args: ScheduleArgs,
) -> Result<String, String> {
    let id = args.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let delay_ms = args.at_ms.saturating_sub(now_ms());
    if delay_ms <= 0 {
        return Err("atMs 必须是未来时间".into());
    }

    let title = args.title.clone();
    let body = args.body.clone();
    let id_for_task = id.clone();

    let handle = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms as u64)).await;
        let _ = app
            .notification()
            .builder()
            .title(&title)
            .body(&body)
            .show();
    });

    state.handles.lock().await.insert(id_for_task, handle);
    Ok(id)
}

#[tauri::command]
pub async fn cancel_notification(
    state: State<'_, NotificationState>,
    args: CancelArgs,
) -> Result<(), String> {
    if let Some(h) = state.handles.lock().await.remove(&args.id) {
        h.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn send_test_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

pub fn init_state() -> NotificationState {
    NotificationState::default()
}
