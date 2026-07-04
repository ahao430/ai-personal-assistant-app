use crate::llm::types::{ChatMessage, LlmConfig, Role, StreamChunk};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

const SSE_DATA_PREFIX: &str = "data:";
const SSE_DONE: &str = "[DONE]";

/// 前端发起对话的入参
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSendArgs {
    /// 完整历史（system 在最前）
    pub messages: Vec<ChatMessage>,
    pub config: LlmConfig,
    /// Tauri event channel，前端监听后增量渲染
    pub event_name: String,
    /// 单次超时（秒），默认 120
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

#[derive(Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiMessage<'a>>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct OpenAiMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct OpenAiStreamDelta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiStreamChunk {
    #[serde(default)]
    choices: Vec<OpenAiStreamChoice>,
}

#[derive(Deserialize)]
struct OpenAiStreamChoice {
    #[serde(default)]
    delta: Option<OpenAiStreamDelta>,
}

fn role_str(r: &Role) -> &'static str {
    match r {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => "tool",
    }
}

fn build_client(timeout_secs: u64) -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
}

pub async fn run_chat_completion(
    app: AppHandle,
    args: ChatSendArgs,
) -> Result<String, String> {
    let ChatSendArgs {
        messages,
        config,
        event_name,
        timeout_secs,
    } = args;

    let base_url = config.base_url.trim_end_matches('/').to_string();
    let url = format!("{}/chat/completions", base_url);

    let temperature = config
        .params
        .get("temperature")
        .and_then(|v| v.as_f64())
        .map(|f| f as f32);

    let body = OpenAiRequest {
        model: &config.model,
        messages: messages
            .iter()
            .map(|m| OpenAiMessage {
                role: role_str(&m.role),
                content: &m.content,
            })
            .collect(),
        stream: true,
        temperature,
    };

    let client = build_client(timeout_secs.unwrap_or(120)).map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut accumulated = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // 按 \n\n 切 SSE 事件
        while let Some(idx) = buf.find("\n\n") {
            let event_block: String = buf.drain(..idx + 2).collect();
            for line in event_block.lines() {
                let line = line.trim();
                if !line.starts_with(SSE_DATA_PREFIX) {
                    continue;
                }
                let payload = line[SSE_DATA_PREFIX.len()..].trim_start();
                if payload == SSE_DONE {
                    let _ = app.emit(
                        &event_name,
                        StreamChunk {
                            delta: String::new(),
                            accumulated: accumulated.clone(),
                            done: true,
                            error: None,
                        },
                    );
                    return Ok(accumulated);
                }
                if let Ok(parsed) = serde_json::from_str::<OpenAiStreamChunk>(payload) {
                    if let Some(choice) = parsed.choices.into_iter().next() {
                        if let Some(delta) = choice.delta {
                            if let Some(d) = delta.content {
                                if !d.is_empty() {
                                    accumulated.push_str(&d);
                                    let _ = app.emit(
                                        &event_name,
                                        StreamChunk {
                                            delta: d,
                                            accumulated: accumulated.clone(),
                                            done: false,
                                            error: None,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 流提前结束但没有 [DONE]
    let _ = app.emit(
        &event_name,
        StreamChunk {
            delta: String::new(),
            accumulated: accumulated.clone(),
            done: true,
            error: None,
        },
    );
    Ok(accumulated)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListModelsArgs {
    pub base_url: String,
    pub api_key: String,
}

pub async fn list_models(args: ListModelsArgs) -> Result<Vec<String>, String> {
    let base_url = args.base_url.trim_end_matches('/').to_string();
    let url = format!("{}/models", base_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .bearer_auth(&args.api_key)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let body: Value = resp.json().await.map_err(|e| format!("解析响应失败: {e}"))?;

    let models: Vec<String> = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["id"].as_str().map(String::from))
        .collect();

    Ok(models)
}
