//! 信令客户端：连 Workers WebSocket，接收"远端变更"通知后通过 Tauri event 通知前端
//! 同时支持本地变更后，通过 channel 把 update 消息推到 WS task 广播给其他设备。

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalingConfig {
    pub url: String,
    pub device_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignalEvent {
    /// 哪张表变更了，如 "todos" / "chat_20260704"；"*" 表示全部
    pub table: String,
}

/// 全局 sender slot：重连 / 重新调用 spawn_signaling_loop 时直接替换。
fn sender_slot() -> &'static Mutex<Option<mpsc::UnboundedSender<String>>> {
    static SLOT: OnceLock<Mutex<Option<mpsc::UnboundedSender<String>>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// 启动一个后台 WS 连接，断线自动重连。
/// 收到消息时 emit `sync-signal` 给前端。
pub fn spawn_signaling_loop(app: AppHandle, cfg: SignalingConfig) {
    let (tx, rx) = mpsc::unbounded_channel::<String>();
    // 把新 sender 存进全局槽位（替换旧的）
    if let Ok(mut g) = sender_slot().lock() {
        *g = Some(tx);
    }

    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        loop {
            match connect_once(&app, &cfg, &mut rx).await {
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

async fn connect_once(
    app: &AppHandle,
    cfg: &SignalingConfig,
    rx: &mut mpsc::UnboundedReceiver<String>,
) -> Result<(), String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let (ws, _) = tokio_tungstenite::connect_async(&cfg.url)
        .await
        .map_err(|e| format!("ws connect: {e}"))?;

    log::info!("[signaling] connected to {}", cfg.url);

    let (mut sink, mut stream) = ws.split();

    // 注册身份
    let hello = serde_json::json!({
        "type": "hello",
        "deviceId": cfg.device_id,
    })
    .to_string();
    sink.send(Message::Text(hello.into()))
        .await
        .map_err(|e| format!("ws send hello: {e}"))?;

    loop {
        tokio::select! {
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(t))) => {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                            if let Some(table) = v.get("table").and_then(|x| x.as_str()) {
                                let _ = app.emit(
                                    "sync-signal",
                                    SignalEvent { table: table.to_string() },
                                );
                            }
                        }
                    }
                    Some(Ok(Message::Ping(p))) => {
                        let _ = sink.send(Message::Pong(p)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => return Ok(()),
                    Some(Err(e)) => return Err(format!("ws read: {e}")),
                    _ => {}
                }
            }
            out = rx.recv() => {
                match out {
                    Some(s) => {
                        if let Err(e) = sink.send(Message::Text(s.into())).await {
                            return Err(format!("ws send: {e}"));
                        }
                    }
                    None => return Ok(()),
                }
            }
        }
    }
}

/// 通过信令服务广播一条 update 消息给其他设备。
/// 信令未启动时静默失败（同步本身不受影响）。
pub fn broadcast_update(_app: &AppHandle, table: &str) {
    let msg = serde_json::json!({
        "type": "update",
        "table": table,
    })
    .to_string();
    if let Ok(g) = sender_slot().lock() {
        if let Some(tx) = g.as_ref() {
            let _ = tx.send(msg);
        }
    }
}
