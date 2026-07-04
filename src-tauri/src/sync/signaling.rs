//! 信令客户端：连 Workers WebSocket，接收"远端变更"通知后通过 Tauri event 通知前端

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalingConfig {
    pub url: String,
    pub device_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignalEvent {
    /// 哪张表变更了，如 "todos" / "chat_20260704"
    pub table: String,
}

/// 启动一个后台 WS 连接，断线自动重连。
/// 收到消息时 emit `sync-signal` 给前端。
pub fn spawn_signaling_loop(app: AppHandle, cfg: SignalingConfig) {
    tokio::spawn(async move {
        loop {
            match connect_once(&app, &cfg).await {
                Ok(()) => {
                    log::info!("[signaling] closed cleanly");
                }
                Err(e) => {
                    log::warn!("[signaling] error: {e}");
                }
            }
            // 重试间隔
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}

async fn connect_once(app: &AppHandle, cfg: &SignalingConfig) -> Result<(), String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let (mut ws, _) = tokio_tungstenite::connect_async(&cfg.url)
        .await
        .map_err(|e| format!("ws connect: {e}"))?;

    log::info!("[signaling] connected to {}", cfg.url);

    // 注册身份
    let hello = serde_json::json!({
        "type": "hello",
        "deviceId": cfg.device_id,
    })
    .to_string();
    ws.send(Message::Text(hello.into()))
        .await
        .map_err(|e| format!("ws send hello: {e}"))?;

    while let Some(msg) = ws.next().await {
        match msg {
            Ok(Message::Text(t)) => {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                    if let Some(table) = v.get("table").and_then(|x| x.as_str()) {
                        let _ = app.emit(
                            "sync-signal",
                            SignalEvent {
                                table: table.to_string(),
                            },
                        );
                    }
                }
            }
            Ok(Message::Ping(p)) => {
                let _ = ws.send(Message::Pong(p)).await;
            }
            Ok(Message::Close(_)) => return Ok(()),
            Err(e) => return Err(format!("ws read: {e}")),
            _ => {}
        }
    }
    Ok(())
}
