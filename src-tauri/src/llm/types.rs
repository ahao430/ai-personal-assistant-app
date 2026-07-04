use serde::{Deserialize, Serialize};

/** 前端传入的模型配置（与 SQLite llm_configs 行一致） */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    /// 文本增量（可能为空，比如 role 确认的首帧）
    pub delta: String,
    /// 本次响应累计的完整文本（方便前端懒渲染）
    pub accumulated: String,
    /// 是否结束
    pub done: bool,
    /// done=true 时的错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
