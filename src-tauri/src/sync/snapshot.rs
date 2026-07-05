//! 把 SQLite 中的表导出为 JSON，反过来也能 apply。
//!
//! 同步流程（增量）：
//!   1. GET 远端 manifest.json（首次同步不存在则视为空）
//!   2. 对每个 unit 比较本地版本 LV 与远端版本 RV：
//!      - LV > RV：dump → PUT，并把 manifest[unit] = LV
//!      - RV > LV：GET → upsert（按 updated_at 比较，避免旧覆盖新）
//!      - LV == RV：跳过
//!   3. PUT 更新后的 manifest.json
//!
//! 聊天按日期分表 chat_YYYYMMDD，导出为 `chat/YYYY/MM/DD.json`。
//! 其余表整体一个 JSON。

use crate::sync::manifest::Manifest;
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
    /// 主动同步（用户点"立即同步"）为 true：完成后广播 update 给其他设备。
    /// 信令触发的被动同步必须为 false：避免循环（A→B→A→...）。
    #[serde(default)]
    pub broadcast: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pushed: usize,
    pub pulled: usize,
    pub skipped: usize,
    pub image_pushed: usize,
    pub image_pulled: usize,
    pub errors: Vec<String>,
}

const SIMPLE_TABLES: &[&str] = &[
    "todos",
    "events",
    "daily_reports",
    "llm_configs",
    "image_configs",
    "user_prefs",
    "notes",
];

const REMOTE_MANIFEST: &str = "manifest.json";

fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("assistant.db"))
}

fn open_db(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let path = db_path(app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    Ok(conn)
}

/// 计算 unit 当前的本地版本号：简单表 max(updated_at)，chat 表 max(created_at)。
/// 表不存在或为空返回 0。
fn query_unit_version(conn: &rusqlite::Connection, unit: &str) -> i64 {
    let is_chat = unit.starts_with("chat_");
    let col = if is_chat { "created_at" } else { "updated_at" };
    let sql = format!("SELECT COALESCE(MAX({col}), 0) FROM {unit}");
    conn.query_row(&sql, [], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
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

/// Upsert 一行到任意表（按 id 主键）。
/// 非聊天表会带 WHERE 条件：只有当远端行的 updated_at >= 本地时才覆盖，
/// 避免旧数据覆盖新数据（last-write-wins）。
fn upsert_row(conn: &rusqlite::Connection, table: &str, row: &Value) -> Result<(), String> {
    let obj = row.as_object().ok_or("row not object")?;
    let is_chat = table.starts_with("chat_");
    let version_col = if is_chat { "created_at" } else { "updated_at" };
    let cols: Vec<&String> = obj.keys().collect();
    let placeholders: Vec<String> = (0..cols.len())
        .map(|i| format!("${}", i + 1))
        .collect();
    let updates: Vec<String> = cols
        .iter()
        .filter(|c| c.as_str() != "id")
        .map(|c| format!("{c}=excluded.{c}"))
        .collect();
    // 非聊天表追加 WHERE：避免远端旧行覆盖本地新行
    let where_clause = if is_chat {
        String::new()
    } else {
        format!(" WHERE excluded.{version_col} >= {table}.{version_col}")
    };
    let sql = format!(
        "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}{where_clause}",
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

    // 确保 base_url 自身存在（首次同步时常需要）
    if let Err(e) = webdav.ensure_root().await {
        errors.push(format!("ensure root: {e}"));
    }

    let conn = open_db(&app)?;

    // ----- 拉取远端 manifest -----
    let mut manifest: Manifest = match webdav.get(REMOTE_MANIFEST).await {
        Ok(Some(bytes)) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Ok(None) => Manifest::default(),
        Err(e) => {
            errors.push(format!("get manifest: {e}"));
            Manifest::default()
        }
    };

    // ----- PUSH 简单表 -----
    for table in SIMPLE_TABLES {
        let lv = query_unit_version(&conn, table);
        let rv = manifest.version_of(table);
        if lv <= rv {
            skipped += 1;
            continue;
        }
        let rows = match dump_table(&conn, table) {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("dump {table}: {e}"));
                continue;
            }
        };
        let payload = serde_json::to_vec(&rows).unwrap_or_default();
        let path = remote_path_for_table(table);
        if let Err(e) = webdav.put(&path, &payload).await {
            errors.push(format!("push {table}: {e}"));
        } else {
            pushed += 1;
            manifest.set_version(table, lv);
        }
    }

    // ----- PUSH 聊天按日 -----
    let chat_tables = list_chat_tables(&conn).unwrap_or_default();
    for tname in &chat_tables {
        if let Some((y, m, d)) = date_from_chat_table(tname) {
            let lv = query_unit_version(&conn, tname);
            let rv = manifest.version_of(tname);
            if lv <= rv {
                skipped += 1;
                continue;
            }
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
                manifest.set_version(tname, lv);
            }
        }
    }

    // ----- PULL 简单表 -----
    for table in SIMPLE_TABLES {
        let lv = query_unit_version(&conn, table);
        let rv = manifest.version_of(table);
        if rv <= lv {
            skipped += 1;
            continue;
        }
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

    // ----- PULL 聊天按日（从远端 manifest 找出所有 chat_ unit） -----
    let chat_units: Vec<String> = manifest
        .files
        .keys()
        .filter(|k| k.starts_with("chat_"))
        .cloned()
        .collect();
    for tname in chat_units {
        let lv = query_unit_version(&conn, &tname);
        let rv = manifest.version_of(&tname);
        if rv <= lv {
            skipped += 1;
            continue;
        }
        let stem = match tname.strip_prefix("chat_") {
            Some(s) if s.len() == 8 => s.to_string(),
            _ => continue,
        };
        let (y, m, d) = match (
            stem[..4].parse::<i32>(),
            stem[4..6].parse::<u32>(),
            stem[6..8].parse::<u32>(),
        ) {
            (Ok(y), Ok(m), Ok(d)) => (y, m, d),
            _ => continue,
        };
        let path = remote_path_for_chat(y, m, d);
        match webdav.get(&path).await {
            Ok(Some(bytes)) => {
                let rows: Vec<Value> = match serde_json::from_slice(&bytes) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
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
            Ok(None) => skipped += 1,
            Err(e) => errors.push(format!("pull {tname}: {e}")),
        }
    }

    // ----- 同步图片文件 -----
    let mut image_pushed = 0;
    let mut image_pulled = 0;
    match crate::sync::images::sync_images(&app, &webdav, &mut manifest).await {
        Ok(result) => {
            image_pushed = result.pushed;
            image_pulled = result.pulled;
            errors.extend(result.errors);
        }
        Err(e) => errors.push(format!("sync images: {e}")),
    }

    // ----- 写回远端 manifest -----
    if let Ok(manifest_bytes) = serde_json::to_vec_pretty(&manifest) {
        if let Err(e) = webdav.put(REMOTE_MANIFEST, &manifest_bytes).await {
            errors.push(format!("put manifest: {e}"));
        }
    }

    // 主动同步完成后，通过信令通知其他设备拉取变更
    if args.broadcast {
        crate::sync::signaling::broadcast_update(&app, "*");
    }

    Ok(SyncResult {
        pushed,
        pulled,
        skipped,
        image_pushed,
        image_pulled,
        errors,
    })
}

#[allow(dead_code)]
async fn list_chat_files_recursive(
    _webdav: &Webdav,
    _base: &str,
) -> Result<Vec<RemoteFile>, String> {
    // 增量同步后远端 manifest 已记录所有 chat_ unit，不再需要递归遍历。
    // 保留函数签名以避免大面积改动；如未来需要再启用可恢复实现。
    Ok(Vec::new())
}

#[allow(dead_code)]
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
