use crate::llm::types::{
    ChatMessage, ChatSendResult, LlmConfig, Role, StreamChunk, ToolCallResult, ToolDefinition,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
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
    #[serde(default)]
    pub tools: Option<Vec<ToolDefinition>>,
}

#[derive(Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiMessage<'a>>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<&'static str>,
}

#[derive(Serialize)]
struct OpenAiMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct OpenAiToolCallFunction {
    #[serde(default)]
    name: String,
    #[serde(default)]
    arguments: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct OpenAiToolCallDelta {
    #[serde(default)]
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<OpenAiToolCallFunction>,
}

#[derive(Debug, Clone, Default)]
struct AccumulatedToolCall {
    id: Option<String>,
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct OpenAiStreamDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAiToolCallDelta>>,
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
) -> Result<ChatSendResult, String> {
    let ChatSendArgs {
        messages,
        config,
        event_name,
        timeout_secs,
        tools,
    } = args;

    let base_url = config.base_url.trim_end_matches('/').to_string();
    let url = format!("{}/chat/completions", base_url);

    let temperature = config
        .params
        .get("temperature")
        .and_then(|v| v.as_f64())
        .map(|f| f as f32);

    let has_tools = tools.as_ref().is_some_and(|t| !t.is_empty());
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
        tools,
        tool_choice: has_tools.then_some("auto"),
    };

    let client = build_client(timeout_secs.unwrap_or(120)).map_err(|e| e.to_string())?;

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

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut accumulated = String::new();
    let mut tool_calls: Vec<AccumulatedToolCall> = Vec::new();

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
                    return Ok(ChatSendResult {
                        content: accumulated,
                        tool_calls: finish_tool_calls(tool_calls),
                    });
                }
                if let Ok(parsed) = serde_json::from_str::<OpenAiStreamChunk>(payload) {
                    if let Some(choice) = parsed.choices.into_iter().next() {
                        if let Some(delta) = choice.delta {
                            if let Some(tool_call_deltas) = delta.tool_calls {
                                accumulate_tool_calls(&mut tool_calls, tool_call_deltas);
                            }
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
    Ok(ChatSendResult {
        content: accumulated,
        tool_calls: finish_tool_calls(tool_calls),
    })
}

fn fmt_reqwest_err(prefix: &str, e: &reqwest::Error) -> String {
    let mut out = format!("{prefix}: {e}");
    let mut src: Option<&(dyn std::error::Error + 'static)> = e.source();
    while let Some(s) = src {
        out.push_str(&format!(" | {s}"));
        src = s.source();
    }
    out
}

fn accumulate_tool_calls(
    tool_calls: &mut Vec<AccumulatedToolCall>,
    deltas: Vec<OpenAiToolCallDelta>,
) {
    for delta in deltas {
        while tool_calls.len() <= delta.index {
            tool_calls.push(AccumulatedToolCall::default());
        }
        let target = &mut tool_calls[delta.index];
        if delta.id.is_some() {
            target.id = delta.id;
        }
        if let Some(function) = delta.function {
            if !function.name.is_empty() {
                target.name.push_str(&function.name);
            }
            if !function.arguments.is_empty() {
                target.arguments.push_str(&function.arguments);
            }
        }
    }
}

fn finish_tool_calls(tool_calls: Vec<AccumulatedToolCall>) -> Vec<ToolCallResult> {
    tool_calls
        .into_iter()
        .filter(|c| !c.name.trim().is_empty())
        .map(|c| ToolCallResult {
            id: c.id,
            name: c.name,
            args: serde_json::from_str(&c.arguments).unwrap_or_else(|_| Value::Object(Default::default())),
        })
        .collect()
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
