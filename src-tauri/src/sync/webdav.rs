#![allow(dead_code)]

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebdavConfig {
    pub base_url: String,
    pub username: String,
    pub password: String,
}

pub struct Webdav {
    client: Client,
    cfg: WebdavConfig,
}

#[derive(Debug, Deserialize)]
struct Propstat {
    #[serde(rename = "prop", default)]
    prop: Option<Prop>,
    #[serde(rename = "status", default)]
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Prop {
    #[serde(rename = "displayname", default)]
    displayname: Option<String>,
    #[serde(rename = "getcontentlength", default)]
    getcontentlength: Option<String>,
    #[serde(rename = "getlastmodified", default)]
    getlastmodified: Option<String>,
    #[serde(rename = "getetag", default)]
    getetag: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct Response {
    href: String,
    #[serde(rename = "propstat", default)]
    propstat: Vec<Propstat>,
}

impl Webdav {
    pub fn new(cfg: WebdavConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client, cfg })
    }

    fn url(&self, path: &str) -> String {
        let base = self.cfg.base_url.trim_end_matches('/');
        format!("{base}/{path}")
    }

    async fn ensure_dir(&self, path: &str) -> Result<(), String> {
        // MKCOL 幂等：已存在返回 405，忽略
        let _ = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .send()
            .await
            .map_err(|e| format!("MKCOL {path}: {e}"))?;
        Ok(())
    }

    pub async fn mkdirs(&self, path: &str) -> Result<(), String> {
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut acc = String::new();
        for p in parts {
            if !acc.is_empty() {
                acc.push('/');
            }
            acc.push_str(p);
            acc.push('/');
            self.ensure_dir(&acc).await?;
        }
        Ok(())
    }

    pub async fn put(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        // 确保父目录存在
        if let Some(idx) = path.rfind('/') {
            let parent = &path[..idx];
            if !parent.is_empty() {
                self.mkdirs(parent).await?;
            }
        }
        let resp = self
            .client
            .put(self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .body(bytes.to_vec())
            .send()
            .await
            .map_err(|e| format!("PUT {path}: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("PUT {path} returned {}", resp.status()));
        }
        Ok(())
    }

    pub async fn get(&self, path: &str) -> Result<Option<Vec<u8>>, String> {
        let resp = self
            .client
            .get(self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .send()
            .await
            .map_err(|e| format!("GET {path}: {e}"))?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(format!("GET {path} returned {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(Some(bytes.to_vec()))
    }

    pub async fn delete(&self, path: &str) -> Result<(), String> {
        let resp = self
            .client
            .delete(self.url(path))
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .send()
            .await
            .map_err(|e| format!("DELETE {path}: {e}"))?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        if !resp.status().is_success() {
            return Err(format!("DELETE {path} returned {}", resp.status()));
        }
        Ok(())
    }

    /// PROPFIND 一个目录，列出子项（含 href + 大小 + mtime + etag）
    pub async fn list_dir(&self, path: &str) -> Result<Vec<RemoteFile>, String> {
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
        <propfind xmlns="DAV:">
          <prop>
            <displayname/>
            <getcontentlength/>
            <getlastmodified/>
            <getetag/>
          </prop>
        </propfind>"#;
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), self.url(path))
            .header("Depth", "1")
            .header(reqwest::header::CONTENT_TYPE, "application/xml")
            .basic_auth(&self.cfg.username, Some(&self.cfg.password))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("PROPFIND {path}: {e}"))?;
        if !resp.status().is_success() && resp.status() != reqwest::StatusCode::MULTI_STATUS {
            return Err(format!("PROPFIND returned {}", resp.status()));
        }
        let text = resp.text().await.map_err(|e| e.to_string())?;
        Ok(parse_propfind(&text, path))
    }
}

#[derive(Debug, Clone)]
pub struct RemoteFile {
    pub path: String,
    pub size: Option<u64>,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
}

/// 简易 XML 解析 PROPFIND multistatus 响应
fn parse_propfind(xml: &str, base_path: &str) -> Vec<RemoteFile> {
    let mut out = Vec::new();
    // 按 <response> 切片
    for resp_block in split_all(xml, "<d:response>", "</d:response>")
        .into_iter()
        .chain(split_all(xml, "<D:response>", "</D:response>"))
    {
        let href = extract_first(&resp_block, "<d:href>", "</d:href>")
            .or_else(|| extract_first(&resp_block, "<D:href>", "</D:href>"))
            .unwrap_or_default();
        // URL decode 简化处理（仅 %20 等常见）
        let href = url_decode(&href);
        let etag = extract_first(&resp_block, "<d:getetag>", "</d:getetag>")
            .or_else(|| extract_first(&resp_block, "<D:getetag>", "</D:getetag>"));
        let lm = extract_first(&resp_block, "<d:getlastmodified>", "</d:getlastmodified>")
            .or_else(|| extract_first(&resp_block, "<D:getlastmodified>", "</D:getlastmodified>"));
        let len = extract_first(&resp_block, "<d:getcontentlength>", "</d:getcontentlength>")
            .or_else(|| extract_first(&resp_block, "<D:getcontentlength>", "</D:getcontentlength>"))
            .and_then(|s| s.parse::<u64>().ok());

        let base = base_path.trim_end_matches('/');
        // 跳过自身（href 以 base 结尾）
        if href.ends_with(base) || href.ends_with(&format!("{}/", base)) {
            continue;
        }
        out.push(RemoteFile {
            path: href,
            size: len,
            last_modified: lm,
            etag,
        });
    }
    out
}

fn split_all<'a>(haystack: &'a str, open: &str, close: &str) -> Vec<String> {
    let mut acc = Vec::new();
    let mut start = 0;
    while let Some(s) = haystack[start..].find(open) {
        let abs = start + s;
        if let Some(e) = haystack[abs..].find(close) {
            let block = &haystack[abs..abs + e + close.len()];
            acc.push(block.to_string());
            start = abs + e + close.len();
        } else {
            break;
        }
    }
    acc
}

fn extract_first<'a>(haystack: &'a str, open: &str, close: &str) -> Option<String> {
    let s = haystack.find(open)? + open.len();
    let rest = &haystack[s..];
    let e = rest.find(close)?;
    Some(rest[..e].trim().to_string())
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(
                &String::from_utf8_lossy(&bytes[i + 1..i + 3]),
                16,
            ) {
                out.push(b as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

// 占位模块（避免单独引 quick-xml crate，自实现极简 XML 解析）
mod quick_xml_hack {
    #![allow(unused_imports)]
    pub use super::*;
}
