//! 把 SQLite 中的表导出为 JSON，反过来也能 apply。
//! 同步流程：
//!   push：导出本地表 → PUT 到 WebDAV
//!   pull：GET 远端 JSON → upsert 到本地（按 id 合并）
//!
//! 聊天按日期分表 chat_YYYYMMDD，导出时为 `chat/YYYY/MM/DD.json`。
//! 其余表整体一个 JSON。

use crate::sync::webdav::{RemoteFile, Webdav};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshotArgs {
    pub base_url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pushed: usize,
    pub pulled: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

const SIMPLE_TABLES: &[&str] = &[
    "todos",
    "events",
    "daily_reports",
    "llm_configs",
    "image_configs",
];

fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("assistant.db"))
}

fn open_db(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let path = db_path(app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    Ok(conn)
}

// 通用：把整表导出为 Vec<json!()>
fn dump_table(conn: &rusqlite::Connection, table: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {table}"))
        .map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();
    let rows = stmt
        .query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for (i, c) in cols.iter().enumerate() {
                let val: Value = match row.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(i) => json!(i),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(s) => {
                        json!(String::from_utf8_lossy(s).to_string())
                    }
                    rusqlite::types::ValueRef::Blob(b) => {
                        json!(String::from_utf8_lossy(b).to_string())
                    }
                };
                obj.insert(c.clone(), val);
            }
            Ok(Value::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn list_chat_tables(conn: &rusqlite::Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%'")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn date_from_chat_table(name: &str) -> Option<(i32, u32, u32)> {
    let s = name.strip_prefix("chat_")?;
    if s.len() != 8 {
        return None;
    }
    let y: i32 = s[..4].parse().ok()?;
    let m: u32 = s[4..6].parse().ok()?;
    let d: u32 = s[6..8].parse().ok()?;
    Some((y, m, d))
}

fn remote_path_for_chat(y: i32, m: u32, d: u32) -> String {
    format!("chat/{y:04}/{m:02}/{d:02}.json")
}

fn remote_path_for_table(table: &str) -> String {
    format!("{table}.json")
}

/// Upsert 一行到任意表（按 id 主键）
fn upsert_row(conn: &rusqlite::Connection, table: &str, row: &Value) -> Result<(), String> {
    let obj = row.as_object().ok_or("row not object")?;
    let cols: Vec<&String> = obj.keys().collect();
    let placeholders: Vec<String> = (0..cols.len())
        .map(|i| format!("${}", i + 1))
        .collect();
    let updates: Vec<String> = cols
        .iter()
        .filter(|c| c.as_str() != "id")
        .map(|c| format!("{c}=excluded.{c}"))
        .collect();
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}",
        cols.iter().map(|c| c.as_str()).collect::<Vec<_>>().join(","),
        placeholders.join(","),
        if updates.is_empty() {
            "id=excluded.id".to_string()
        } else {
            updates.join(",")
        }
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<Box<dyn rusqlite::ToSql>> = cols
        .iter()
        .map(|c| -> Box<dyn rusqlite::ToSql> {
            let v = &obj[*c];
            match v {
                Value::Null => Box::new(rusqlite::types::Null),
                Value::Bool(b) => Box::new(*b as i64),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else {
                        Box::new(n.as_f64().unwrap_or(0.0))
                    }
                }
                Value::String(s) => Box::new(s.clone()),
                _ => Box::new(v.to_string()),
            }
        })
        .collect();
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    stmt.execute(&param_refs[..])
        .map_err(|e| format!("upsert {table}: {e}"))?;
    Ok(())
}

fn ensure_chat_table(conn: &rusqlite::Connection, name: &str) -> Result<(), String> {
    conn.execute(
        &format!(
            "CREATE TABLE IF NOT EXISTS {name} (
              id TEXT PRIMARY KEY,
              role TEXT NOT NULL,
              content TEXT NOT NULL DEFAULT '',
              model TEXT,
              tokens INTEGER,
              attachments TEXT NOT NULL DEFAULT '[]',
              created_at INTEGER NOT NULL
            )"
        ),
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_now(app: AppHandle, args: SyncSnapshotArgs) -> Result<SyncResult, String> {
    let cfg = crate::sync::WebdavConfig {
        base_url: args.base_url,
        username: args.username,
        password: args.password,
    };
    let webdav = Webdav::new(cfg)?;

    let mut pushed = 0;
    let mut pulled = 0;
    let mut skipped = 0;
    let mut errors: Vec<String> = Vec::new();

    let conn = open_db(&app)?;

    // ----- PUSH 简单表 -----
    for table in SIMPLE_TABLES {
        match dump_table(&conn, table) {
            Ok(rows) => {
                let payload = serde_json::to_vec(&rows).unwrap_or_default();
                let path = remote_path_for_table(table);
                if let Err(e) = webdav.put(&path, &payload).await {
                    errors.push(format!("push {table}: {e}"));
                } else {
                    pushed += 1;
                }
            }
            Err(e) => errors.push(format!("dump {table}: {e}")),
        }
    }

    // ----- PUSH 聊天按日 -----
    let chat_tables = list_chat_tables(&conn).unwrap_or_default();
    for tname in &chat_tables {
        if let Some((y, m, d)) = date_from_chat_table(tname) {
            let rows = match dump_table(&conn, tname) {
                Ok(r) => r,
                Err(e) => {
                    errors.push(format!("dump {tname}: {e}"));
                    continue;
                }
            };
            let payload = serde_json::to_vec(&rows).unwrap_or_default();
            let path = remote_path_for_chat(y, m, d);
            if let Err(e) = webdav.put(&path, &payload).await {
                errors.push(format!("push {tname}: {e}"));
            } else {
                pushed += 1;
            }
        }
    }

    // ----- PULL 简单表 -----
    for table in SIMPLE_TABLES {
        let path = remote_path_for_table(table);
        match webdav.get(&path).await {
            Ok(Some(bytes)) => {
                let rows: Vec<Value> = match serde_json::from_slice(&bytes) {
                    Ok(v) => v,
                    Err(e) => {
                        errors.push(format!("parse {table}: {e}"));
                        continue;
                    }
                };
                for row in &rows {
                    if let Err(e) = upsert_row(&conn, table, row) {
                        errors.push(e);
                    } else {
                        pulled += 1;
                    }
                }
            }
            Ok(None) => skipped += 1,
            Err(e) => errors.push(format!("pull {table}: {e}")),
        }
    }

    // ----- PULL 聊天按日（列 chat/ 目录） -----
    if let Ok(remote_files) = list_chat_files_recursive(&webdav, "chat").await {
        for rf in remote_files {
            let path = &rf.path;
            // path 形如 .../chat/2026/07/04.json，提取相对路径
            let rel = match path.find("chat/") {
                Some(i) => &path[i..],
                None => continue,
            };
            match webdav.get(rel).await {
                Ok(Some(bytes)) => {
                    let rows: Vec<Value> = match serde_json::from_slice(&bytes) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    // 文件名 DD.json → chat_YYYYMMDD
                    if let Some(fname) = rel.split('/').next_back() {
                        if let Some(stem) = fname.strip_suffix(".json") {
                            if stem.len() == 2 {
                                // 解析 year/month 从路径
                                let parts: Vec<&str> = rel.split('/').collect();
                                if parts.len() >= 4 {
                                    let y = parts[1];
                                    let m = parts[2];
                                    let tname = format!("chat_{y}{m}{stem}");
                                    if let Err(e) = ensure_chat_table(&conn, &tname) {
                                        errors.push(e);
                                        continue;
                                    }
                                    for row in &rows {
                                        if let Err(e) = upsert_row(&conn, &tname, row) {
                                            errors.push(e);
                                        } else {
                                            pulled += 1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(None) => skipped += 1,
                Err(e) => errors.push(format!("pull {rel}: {e}")),
            }
        }
    }

    Ok(SyncResult {
        pushed,
        pulled,
        skipped,
        errors,
    })
}

async fn list_chat_files_recursive(
    webdav: &Webdav,
    base: &str,
) -> Result<Vec<RemoteFile>, String> {
    // 递归遍历 year/month 两层；命中 .json 文件就收集
    let mut all = Vec::new();
    let years = webdav.list_dir(base).await.unwrap_or_default();
    for y in years {
        let ypath = format!("{base}/{}", basename(&y.path));
        let months = webdav.list_dir(&ypath).await.unwrap_or_default();
        for m in months {
            let mpath = format!("{ypath}/{}", basename(&m.path));
            let files = webdav.list_dir(&mpath).await.unwrap_or_default();
            for f in files {
                if f.path.ends_with(".json") {
                    all.push(f);
                }
            }
        }
    }
    Ok(all)
}

fn basename(p: &str) -> String {
    p.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string()
}

// 把 chrono 引用占着
#[allow(dead_code)]
fn _unused() -> chrono::DateTime<Utc> {
    Utc::now()
}

// 把 HashMap 引用占着
#[allow(dead_code)]
fn _unused2() -> HashMap<String, String> {
    HashMap::new()
}
