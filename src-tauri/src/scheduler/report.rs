//! 日报生成：收集当日 chat + done todos + events → 调 LLM → 写入 daily_reports

use crate::llm::{LlmConfig, Role};
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

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
    content: String,
}

#[derive(serde::Deserialize)]
struct OpenAiResponse {
    #[serde(default)]
    choices: Vec<OpenAiChoice>,
}

#[derive(serde::Deserialize)]
struct OpenAiChoice {
    #[serde(default)]
    message: Option<OpenAiRespMessage>,
}

#[derive(serde::Deserialize)]
struct OpenAiRespMessage {
    #[serde(default)]
    content: Option<String>,
}

fn role_str(r: &Role) -> &'static str {
    match r {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => "tool",
    }
}

pub async fn generate_daily_report(
    app: AppHandle,
    date: &str,
    config: LlmConfig,
) -> Result<String, String> {
    // date: YYYY-MM-DD
    let (y, m, d) = parse_date(date)?;
    let table = format!("chat_{y:04}{m:02}{d:02}");

    let conn = open_db(&app)?;

    // 收集聊天
    let mut chat_lines: Vec<String> = Vec::new();
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            rusqlite::params![&table],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        let mut stmt = conn
            .prepare(&format!("SELECT role, content, created_at FROM {table} ORDER BY created_at ASC"))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let role: String = r.get(0)?;
                let content: String = r.get(1)?;
                let ts: i64 = r.get(2)?;
                Ok((role, content, ts))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            let (role, content, ts) = r.map_err(|e| e.to_string())?;
            let time = chrono::DateTime::from_timestamp_millis(ts)
                .map(|x| x.format("%H:%M").to_string())
                .unwrap_or_default();
            let speaker = if role == "user" { "我" } else { "助手" };
            let text: String = content.chars().take(300).collect();
            chat_lines.push(format!("[{time}] {speaker}: {text}"));
        }
    }

    // 完成的 todos
    let mut done_lines: Vec<String> = Vec::new();
    {
        let day_start = chrono::NaiveDate::from_ymd_opt(y, m, d)
            .ok_or("invalid date")?
            .and_hms_opt(0, 0, 0)
            .ok_or("invalid date")?
            .and_utc()
            .timestamp_millis();
        let day_end = day_start + 86_400_000;
        let mut stmt = conn
            .prepare(
                "SELECT title FROM todos WHERE status='done' AND updated_at >= ?1 AND updated_at < ?2 ORDER BY updated_at",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![day_start, day_end], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for r in rows {
            done_lines.push(r.map_err(|e| e.to_string())?);
        }
    }

    // events 当日
    let mut event_lines: Vec<String> = Vec::new();
    {
        let day_start = chrono::NaiveDate::from_ymd_opt(y, m, d)
            .ok_or("invalid date")?
            .and_hms_opt(0, 0, 0)
            .ok_or("invalid date")?
            .and_utc()
            .timestamp_millis();
        let day_end = day_start + 86_400_000;
        let mut stmt = conn
            .prepare("SELECT title, start_at, CAST(all_day AS INTEGER) AS all_day FROM events WHERE start_at >= ?1 AND start_at < ?2 ORDER BY start_at")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![day_start, day_end], |r| {
                let title: String = r.get(0)?;
                let start: i64 = r.get(1)?;
                let all_day: i64 = r.get(2)?;
                Ok((title, start, all_day))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            let (title, start, all_day) = r.map_err(|e| e.to_string())?;
            let time = chrono::DateTime::from_timestamp_millis(start)
                .map(|x| x.format("%H:%M").to_string())
                .unwrap_or_default();
            let mark = if all_day != 0 { "全天" } else { &time };
            event_lines.push(format!("[{mark}] {title}"));
        }
    }

    let today_done = done_lines.len() as i64;
    let pending_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM todos WHERE status='pending'", [], |r| r.get(0))
        .unwrap_or(0);
    let events_count = event_lines.len() as i64;

    let user_prompt = format!(
        "请基于以下信息生成本日（{date}）的工作日报。\n\n\
## 今日对话摘录\n{}\n\n\
## 完成的任务（{}）\n{}\n\n\
## 今日事件（{}）\n{}\n\n\
## 未完成任务\n{}\n\n\
请用中文输出，结构为：\n\
1) 一句话总结当天\n\
2) 关键产出 / 完成项\n\
3) 待跟进 / 未完成\n\
4) 一条明日建议（结合未完成任务与事件）\n\
Markdown 格式，简洁，避免空话。",
        if chat_lines.is_empty() {
            "（无对话记录）".to_string()
        } else {
            chat_lines.join("\n")
        },
        today_done,
        if done_lines.is_empty() {
            "无".to_string()
        } else {
            done_lines
                .iter()
                .map(|s| format!("- {s}"))
                .collect::<Vec<_>>()
                .join("\n")
        },
        events_count,
        if event_lines.is_empty() {
            "无".to_string()
        } else {
            event_lines
                .iter()
                .map(|s| format!("- {s}"))
                .collect::<Vec<_>>()
                .join("\n")
        },
        pending_count,
    );

    let system_prompt = "你是日报生成助手。基于用户当天数据，输出简洁、可执行、避免空话的中文 Markdown 日报。".to_string();

    let base_url = config.base_url.trim_end_matches('/').to_string();
    let url = format!("{base_url}/chat/completions");
    let body = OpenAiRequest {
        model: &config.model,
        messages: vec![
            OpenAiMessage {
                role: role_str(&Role::System),
                content: system_prompt,
            },
            OpenAiMessage {
                role: role_str(&Role::User),
                content: user_prompt,
            },
        ],
        stream: false,
        temperature: config
            .params
            .get("temperature")
            .and_then(|v| v.as_f64())
            .map(|f| f as f32),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM 请求失败: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    let parsed: OpenAiResponse = resp.json().await.map_err(|e| format!("解析失败: {e}"))?;
    let summary = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message)
        .and_then(|m| m.content)
        .ok_or("LLM 返回空")?;

    // 写入 daily_reports
    let raw_stats = serde_json::json!({
        "chatLines": chat_lines.len(),
        "todoDone": today_done,
        "todoPending": pending_count,
        "eventsCount": events_count,
    })
    .to_string();
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO daily_reports (date, summary, todo_done, todo_pending, events_count, raw_stats, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(date) DO UPDATE SET
           summary=excluded.summary,
           todo_done=excluded.todo_done,
           todo_pending=excluded.todo_pending,
           events_count=excluded.events_count,
           raw_stats=excluded.raw_stats,
           created_at=excluded.created_at",
        rusqlite::params![date, summary, today_done, pending_count, events_count, raw_stats, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(summary)
}

fn open_db(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let path = dir.join("assistant.db");
    rusqlite::Connection::open(&path).map_err(|e| e.to_string())
}

fn parse_date(s: &str) -> Result<(i32, u32, u32), String> {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("invalid date {s}"));
    }
    let y: i32 = parts[0].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let m: u32 = parts[1].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let d: u32 = parts[2].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    Ok((y, m, d))
}

#[allow(dead_code)]
fn _unused() -> HashMap<String, String> {
    HashMap::new()
}
