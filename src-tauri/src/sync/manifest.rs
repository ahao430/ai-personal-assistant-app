//! 远端 manifest（WebDAV 根的 manifest.json）：记录每个同步 unit 在远端的最新版本号。
//!
//! 版本号定义：
//! - 简单表：`max(updated_at)`
//! - chat_YYYYMMDD：`max(created_at)`（聊天 append-only，无 updated_at）
//!
//! 同步判定：直接比较本地 DB 算出的 LV 与远端 manifest 的 RV。
//! - LV > RV：本地有未推送的变更 → PUSH，并把 RV 抬到 LV
//! - RV > LV：远端有未拉取的变更 → PULL
//! - LV == RV：跳过

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub files: HashMap<String, ManifestEntry>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    /// 该 unit 在远端的最新版本号
    pub synced_max_updated: i64,
}

impl Manifest {
    pub fn version_of(&self, unit: &str) -> i64 {
        self.files
            .get(unit)
            .map(|e| e.synced_max_updated)
            .unwrap_or(0)
    }

    pub fn set_version(&mut self, unit: &str, v: i64) {
        self.files.insert(
            unit.to_string(),
            ManifestEntry {
                synced_max_updated: v,
            },
        );
    }
}
