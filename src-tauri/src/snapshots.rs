use crate::project;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_AUTO: usize = 40;
const TEXT_EXTS: &[&str] = &["tex", "bib", "sty", "cls", "bst", "txt", "md", "cfg", "def", "ltx", "dtx"];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub created: u64,
    pub label: String,
    pub auto: bool,
    pub files: usize,
}

fn snapshots_dir(root: &Path) -> PathBuf {
    root.join(".lasty").join("snapshots")
}

fn is_text(path: &str) -> bool {
    Path::new(path)
        .extension()
        .is_some_and(|e| TEXT_EXTS.contains(&e.to_string_lossy().to_lowercase().as_str()))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn snapshot_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("Invalid snapshot: {id}"));
    }
    Ok(snapshots_dir(root).join(id))
}

pub fn list(root: &Path) -> Vec<Snapshot> {
    let mut out: Vec<Snapshot> = fs::read_dir(snapshots_dir(root))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| fs::read_to_string(e.path().join("meta.json")).ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    out.sort_by(|a: &Snapshot, b| b.created.cmp(&a.created));
    out
}

pub fn create(root: &Path, label: &str, auto: bool) -> Result<Snapshot, String> {
    let mut created = now_ms();
    while snapshots_dir(root).join(created.to_string()).exists() {
        created += 1;
    }
    let id = created.to_string();
    let dir = snapshots_dir(root).join(&id);
    let files: Vec<String> = project::list_files(root)
        .into_iter()
        .filter(|f| !f.is_dir && is_text(&f.path))
        .map(|f| f.path)
        .collect();
    for rel in &files {
        let dest = dir.join("files").join(rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(root.join(rel), &dest).map_err(|e| format!("Failed to snapshot {rel}: {e}"))?;
    }
    let snapshot = Snapshot { id, created, label: label.into(), auto, files: files.len() };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    fs::write(dir.join("meta.json"), json).map_err(|e| e.to_string())?;
    prune(root);
    Ok(snapshot)
}

fn prune(root: &Path) {
    for old in list(root).into_iter().filter(|s| s.auto).skip(MAX_AUTO) {
        let _ = fs::remove_dir_all(snapshots_dir(root).join(old.id));
    }
}

/// Restores every file of a snapshot. The current state is saved as a snapshot first,
/// and files that were added after the snapshot are left alone.
pub fn restore(root: &Path, id: &str) -> Result<(), String> {
    let files_dir = snapshot_dir(root, id)?.join("files");
    if !files_dir.is_dir() {
        return Err("This snapshot no longer exists.".into());
    }
    create(root, "Before restoring a snapshot", false)?;
    restore_dir(root, &files_dir, &files_dir)
}

fn restore_dir(root: &Path, base: &Path, dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            restore_dir(root, base, &path)?;
            continue;
        }
        let rel = project::relative(base, &path);
        let dest = project::resolve(root, &rel)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(&path, &dest).map_err(|e| format!("Failed to restore {rel}: {e}"))?;
    }
    Ok(())
}

pub fn read_file(root: &Path, id: &str, file: &str) -> Result<String, String> {
    let path = project::resolve(&snapshot_dir(root, id)?.join("files"), file)?;
    fs::read_to_string(path).map_err(|_| format!("{file} is not part of this snapshot."))
}

pub fn delete(root: &Path, id: &str) -> Result<(), String> {
    fs::remove_dir_all(snapshot_dir(root, id)?).map_err(|e| format!("Failed to delete snapshot: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("ch")).unwrap();
        fs::write(root.join("main.tex"), "v1").unwrap();
        fs::write(root.join("ch/a.tex"), "a1").unwrap();
        fs::write(root.join("img.png"), "png").unwrap();

        let snap = create(root, "first", false).unwrap();
        assert_eq!(snap.files, 2);
        fs::write(root.join("main.tex"), "v2").unwrap();
        fs::write(root.join("new.tex"), "n").unwrap();

        assert_eq!(read_file(root, &snap.id, "main.tex").unwrap(), "v1");
        restore(root, &snap.id).unwrap();
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "v1");
        assert!(root.join("new.tex").is_file());
        assert_eq!(list(root).len(), 2);
        assert!(project::list_files(root).iter().all(|f| !f.path.starts_with(".lasty")));
        assert!(delete(root, "../x").is_err());
    }
}
