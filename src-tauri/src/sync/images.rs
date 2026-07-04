use crate::sync::manifest::Manifest;
use crate::sync::webdav::Webdav;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub struct ImageSyncResult {
    pub pushed: usize,
    pub pulled: usize,
    pub errors: Vec<String>,
}

pub async fn sync_images(
    app: &AppHandle,
    webdav: &Webdav,
    manifest: &mut Manifest,
) -> Result<ImageSyncResult, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let local = collect_images(&dir)?;
    let mut pushed = 0;
    let mut pulled = 0;
    let mut errors = Vec::new();

    for (rel, size) in &local {
        if manifest.image_size(rel) == Some(*size) {
            continue;
        }
        let path = dir.join(rel);
        match std::fs::read(&path) {
            Ok(bytes) => match webdav.put(&remote_image_path(rel), &bytes).await {
                Ok(()) => {
                    manifest.set_image(rel, *size);
                    pushed += 1;
                }
                Err(e) => errors.push(format!("push image {rel}: {e}")),
            },
            Err(e) => errors.push(format!("read image {rel}: {e}")),
        }
    }

    let remote_images = manifest.images.clone();
    for (rel, size) in remote_images {
        if local.contains_key(&rel) {
            continue;
        }
        match webdav.get(&remote_image_path(&rel)).await {
            Ok(Some(bytes)) => {
                let path = dir.join(&rel);
                if let Some(parent) = path.parent() {
                    if let Err(e) = std::fs::create_dir_all(parent) {
                        errors.push(format!("mkdir image {rel}: {e}"));
                        continue;
                    }
                }
                if let Err(e) = std::fs::write(&path, &bytes) {
                    errors.push(format!("write image {rel}: {e}"));
                } else {
                    manifest.set_image(&rel, size);
                    pulled += 1;
                }
            }
            Ok(None) => errors.push(format!("pull image {rel}: remote missing")),
            Err(e) => errors.push(format!("pull image {rel}: {e}")),
        }
    }

    Ok(ImageSyncResult {
        pushed,
        pulled,
        errors,
    })
}

fn collect_images(dir: &Path) -> Result<HashMap<String, u64>, String> {
    let mut out = HashMap::new();
    collect_images_inner(dir, dir, &mut out)?;
    Ok(out)
}

fn collect_images_inner(
    root: &Path,
    dir: &Path,
    out: &mut HashMap<String, u64>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_dir() {
            collect_images_inner(root, &path, out)?;
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        if let Some(rel) = normalize_rel(root, &path) {
            out.insert(rel, meta.len());
        }
    }
    Ok(())
}

fn normalize_rel(root: &Path, path: &PathBuf) -> Option<String> {
    path.strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

fn remote_image_path(rel: &str) -> String {
    format!("images/{}", rel.trim_start_matches('/'))
}
