//! WebDAV + 信令同步
//!
//! 策略：
//! - 聊天按"日"导出为 `chat/YYYY/MM/DD.json`（一天一个文件）
//! - todos / events / daily_reports / llm_configs / image_configs 整表一个 JSON
//! - manifest.json 汇总所有文件 + ETag/Last-Modified，用于增量跳过
//! - Workers 信令服务只广播"哪张表变了"，不传内容；接收端按需拉对应文件

pub mod webdav;
pub mod snapshot;
pub mod signaling;

pub use snapshot::*;
pub use webdav::*;
