use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_RECENT: usize = 12;
const MAX_DEPTH: usize = 8;
const SKIP_DIRS: &[&str] = &["node_modules", "target", "_minted", "__pycache__"];
const ARTIFACT_EXTS: &[&str] = &[
    "aux", "log", "out", "toc", "lof", "lot", "fls", "fdb_latexmk", "synctex", "gz", "bbl", "blg",
    "nav", "snm", "vrb",
];

pub const ARTICLE_TEMPLATE: &str = r"\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath}

\title{Untitled}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Start writing here. The preview updates as you type.

\end{document}
";

const THESIS_TEMPLATE: &str = r"\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage[margin=2.5cm]{geometry}
\usepackage[hidelinks]{hyperref}

\title{Untitled}
\author{}
\date{\today}

\begin{document}
\maketitle
\tableofcontents

\input{chapters/introduction}

\bibliographystyle{plain}
\bibliography{references}

\end{document}
";

const THESIS_INTRO: &str = r"\chapter{Introduction}
\label{chap:introduction}

Start writing here.
";

const THESIS_BIB: &str = r"@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The \TeX book},
  publisher = {Addison-Wesley},
  year      = {1984}
}
";

const BEAMER_TEMPLATE: &str = r"\documentclass{beamer}
\usetheme{default}
\setbeamertemplate{navigation symbols}{}

\title{Untitled}
\author{}
\date{\today}

\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{First Slide}
  \begin{itemize}
    \item A point
    \item Another point
  \end{itemize}
\end{frame}

\end{document}
";

const LETTER_TEMPLATE: &str = r"\documentclass[11pt]{letter}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}

\signature{Your Name}
\address{Your Street 1 \\ 12345 City}

\begin{document}

\begin{letter}{Recipient \\ Street 2 \\ 54321 Town}
\opening{Dear Sir or Madam,}

Start writing here.

\closing{Yours sincerely,}
\end{letter}

\end{document}
";

/// Files written for each project template, as (relative path, content).
fn template_files(template: &str) -> Result<Vec<(&'static str, &'static str)>, String> {
    Ok(match template {
        "article" => vec![("main.tex", ARTICLE_TEMPLATE)],
        "thesis" => vec![
            ("main.tex", THESIS_TEMPLATE),
            ("chapters/introduction.tex", THESIS_INTRO),
            ("references.bib", THESIS_BIB),
        ],
        "beamer" => vec![("main.tex", BEAMER_TEMPLATE)],
        "letter" => vec![("main.tex", LETTER_TEMPLATE)],
        other => return Err(format!("Unknown template: {other}")),
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub main_file: String,
    pub last_opened: u64,
    #[serde(default)]
    pub exists: bool,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub recent: Vec<RecentProject>,
    pub last_open: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub depth: usize,
    pub is_dir: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub main_file: String,
    pub files: Vec<FileEntry>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn load_store(file: &Path) -> Store {
    fs::read_to_string(file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_store(file: &Path, store: &Store) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(file, json).map_err(|e| format!("Failed to save settings: {e}"))
}

impl Store {
    pub fn recent_with_status(&self) -> Vec<RecentProject> {
        self.recent
            .iter()
            .cloned()
            .map(|mut p| {
                p.exists = Path::new(&p.path).is_dir();
                p
            })
            .collect()
    }

    pub fn main_file_for(&self, path: &str) -> Option<String> {
        self.recent.iter().find(|p| p.path == path).map(|p| p.main_file.clone())
    }

    pub fn touch(&mut self, path: &str, name: &str, main_file: &str) {
        self.recent.retain(|p| p.path != path);
        self.recent.insert(
            0,
            RecentProject {
                path: path.into(),
                name: name.into(),
                main_file: main_file.into(),
                last_opened: now(),
                exists: true,
            },
        );
        self.recent.truncate(MAX_RECENT);
        self.last_open = Some(path.into());
    }

    pub fn forget(&mut self, path: &str) {
        self.recent.retain(|p| p.path != path);
        if self.last_open.as_deref() == Some(path) {
            self.last_open = None;
        }
    }
}

pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel.is_empty() || rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Invalid path: {rel}"));
    }
    Ok(root.join(rel_path))
}

pub fn project_name(root: &Path) -> String {
    root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| root.display().to_string())
}

fn is_artifact(name: &str) -> bool {
    name.ends_with(".synctex.gz")
        || Path::new(name)
            .extension()
            .is_some_and(|e| ARTIFACT_EXTS.contains(&e.to_string_lossy().as_ref()))
}

pub fn list_files(root: &Path) -> Vec<FileEntry> {
    let mut out = Vec::new();
    walk(root, "", 0, &mut out);
    out
}

fn walk(dir: &Path, prefix: &str, depth: usize, out: &mut Vec<FileEntry>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else { return };
    let mut entries: Vec<(String, bool)> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().ok()?.is_dir();
            let hidden = name.starts_with('.');
            let skipped = is_dir && SKIP_DIRS.contains(&name.as_str());
            (!hidden && !skipped && (is_dir || !is_artifact(&name))).then_some((name, is_dir))
        })
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase())));

    for (name, is_dir) in entries {
        let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        out.push(FileEntry { path: path.clone(), name: name.clone(), depth, is_dir });
        if is_dir {
            walk(&dir.join(&name), &path, depth + 1, out);
        }
    }
}

pub fn detect_main(root: &Path, files: &[FileEntry]) -> String {
    if root.join("main.tex").is_file() {
        return "main.tex".into();
    }
    let tex: Vec<&FileEntry> = files.iter().filter(|f| !f.is_dir && f.path.ends_with(".tex")).collect();
    tex.iter()
        .find(|f| {
            fs::read_to_string(root.join(&f.path)).is_ok_and(|s| s.contains("\\documentclass"))
        })
        .or(tex.first())
        .map(|f| f.path.clone())
        .unwrap_or_else(|| "main.tex".into())
}

pub fn create_project(parent: &Path, name: &str, template: &str) -> Result<PathBuf, String> {
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') {
        return Err("Use a project name without slashes or a leading dot.".into());
    }
    let files = template_files(template)?;
    let root = parent.join(name);
    if root.exists() {
        return Err(format!("A folder named “{name}” already exists in this location."));
    }
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create folder: {e}"))?;
    for (rel, content) in files {
        let path = root.join(rel);
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("Failed to create folder: {e}"))?;
        }
        let content = content.replace(r"\title{Untitled}", &format!(r"\title{{{name}}}"));
        fs::write(&path, content).map_err(|e| format!("Failed to write {rel}: {e}"))?;
    }
    Ok(root)
}

/// Picks a path inside `dir` that does not exist yet, appending " 2", " 3", … to the stem.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|n| dir.join(format!("{stem} {n}{ext}")))
        .find(|c| !c.exists())
        .expect("unbounded range")
}

pub fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn rename(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let src = resolve(root, from)?;
    let dest = resolve(root, to)?;
    if !src.exists() {
        return Err(format!("{from} no longer exists."));
    }
    if dest.exists() {
        return Err(format!("{to} already exists."));
    }
    if dest.starts_with(&src) {
        return Err("A folder can't be moved into itself.".into());
    }
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dest).map_err(|e| format!("Failed to rename {from}: {e}"))
}

/// Copies outside files or folders into `dest_dir` (relative to root). Returns their new relative paths.
pub fn import(root: &Path, sources: &[String], dest_dir: &str) -> Result<Vec<String>, String> {
    let dir = if dest_dir.is_empty() { root.to_path_buf() } else { resolve(root, dest_dir)? };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for source in sources {
        let src = Path::new(source);
        let Some(name) = src.file_name() else { continue };
        if src.starts_with(root) {
            out.push(relative(root, src));
            continue;
        }
        let dest = unique_path(&dir, &name.to_string_lossy());
        copy_recursive(src, &dest).map_err(|e| format!("Failed to import {}: {e}", src.display()))?;
        out.push(relative(root, &dest));
    }
    Ok(out)
}

fn copy_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dest)?;
        for entry in fs::read_dir(src)?.flatten() {
            copy_recursive(&entry.path(), &dest.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dest).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_escapes() {
        let root = Path::new("/p");
        assert!(resolve(root, "../x").is_err());
        assert!(resolve(root, "/etc/passwd").is_err());
        assert!(resolve(root, "a/../../x").is_err());
        assert!(resolve(root, "").is_err());
        assert_eq!(resolve(root, "a/b.tex").unwrap(), Path::new("/p/a/b.tex"));
    }

    #[test]
    fn creates_project_and_lists_files() {
        let parent = tempfile::tempdir().unwrap();
        let root = create_project(parent.path(), "thesis", "article").unwrap();
        fs::create_dir(root.join("chapters")).unwrap();
        fs::write(root.join("chapters/intro.tex"), "").unwrap();
        fs::write(root.join("main.aux"), "").unwrap();
        fs::write(root.join(".hidden"), "").unwrap();

        let files = list_files(&root);
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["chapters", "chapters/intro.tex", "main.tex"]);
        assert_eq!(detect_main(&root, &files), "main.tex");
        assert!(fs::read_to_string(root.join("main.tex")).unwrap().contains(r"\title{thesis}"));
        assert!(create_project(parent.path(), "thesis", "article").is_err());
        assert!(create_project(parent.path(), "other", "nope").is_err());
    }

    #[test]
    fn thesis_template_creates_chapters() {
        let parent = tempfile::tempdir().unwrap();
        let root = create_project(parent.path(), "t", "thesis").unwrap();
        assert!(root.join("chapters/introduction.tex").is_file());
        assert!(root.join("references.bib").is_file());
    }

    #[test]
    fn rename_and_import() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("a.tex"), "x").unwrap();
        rename(&root, "a.tex", "sub/b.tex").unwrap();
        assert!(root.join("sub/b.tex").is_file());
        assert!(rename(&root, "sub", "sub/inner").is_err());

        let outside = dir.path().join("fig.png");
        fs::write(&outside, "png").unwrap();
        let src = outside.to_string_lossy().into_owned();
        assert_eq!(import(&root, &[src.clone()], "images").unwrap(), ["images/fig.png"]);
        assert_eq!(import(&root, &[src], "images").unwrap(), ["images/fig 2.png"]);
    }

    #[test]
    fn store_keeps_most_recent_first() {
        let mut s = Store::default();
        s.touch("/a", "a", "main.tex");
        s.touch("/b", "b", "main.tex");
        s.touch("/a", "a", "doc.tex");
        assert_eq!(s.recent.len(), 2);
        assert_eq!(s.recent[0].path, "/a");
        assert_eq!(s.main_file_for("/a").as_deref(), Some("doc.tex"));
        s.forget("/a");
        assert_eq!(s.last_open, None);
    }
}
