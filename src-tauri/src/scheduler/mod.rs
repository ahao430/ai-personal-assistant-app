//! 日报 / 定时任务

use crate::llm::{ChatMessage, ChatSendArgs, LlmConfig, Role};
use crate::scheduler::report::generate_daily_report;
use serde::Deserialize;
use tauri::AppHandle;

pub mod report;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenReportArgs {
    /// YYYY-MM-DD
    pub date: String,
    pub config: LlmConfig,
}

#[tauri::command]
pub async fn generate_report(
    app: AppHandle,
    args: GenReportArgs,
) -> Result<String, String> {
    let chat_args = ChatSendArgs {
        messages: vec![],
        config: args.config.clone(),
        event_name: "report-internal".into(),
        timeout_secs: Some(180),
    };
    let _ = chat_args; // 占位
    // 直接复用 report::generate 走非流式调用
    generate_daily_report(app, &args.date, args.config).await
}

#[allow(dead_code)]
fn _types_marker(_m: ChatMessage, _r: Role, _a: ChatSendArgs) {}
