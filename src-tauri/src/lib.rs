use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// Common TeX install locations that are often missing from PATH when the app
/// is launched from Finder / a desktop launcher instead of a shell.
const EXTRA_TEX_PATHS: &[&str] = &[
    "/Library/TeX/texbin",
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/usr/local/texlive/bin",
];

fn search_path() -> OsString {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|p| env::split_paths(&p).collect())
        .unwrap_or_default();
    paths.extend(EXTRA_TEX_PATHS.iter().map(PathBuf::from));
    env::join_paths(paths).unwrap_or_default()
}

fn find_executable(name: &str, path: &OsString) -> Option<PathBuf> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    env::split_paths(path)
        .map(|dir| dir.join(&exe))
        .find(|candidate| candidate.is_file())
}

fn run_pdflatex(bin: &Path, dir: &Path, path: &OsString) -> std::io::Result<Output> {
    Command::new(bin)
        .current_dir(dir)
        .env("PATH", path)
        .args([
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-no-shell-escape",
            "-file-line-error",
            "main.tex",
        ])
        .output()
}

fn run_tectonic(bin: &Path, dir: &Path, path: &OsString) -> std::io::Result<Output> {
    Command::new(bin)
        .current_dir(dir)
        .env("PATH", path)
        .args(["--chatter", "minimal", "--outdir", ".", "main.tex"])
        .output()
}

/// Extracts the relevant error lines from a LaTeX log so the UI isn't flooded.
fn summarize_log(log: &str) -> String {
    let lines: Vec<&str> = log.lines().collect();
    let mut out = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if line.starts_with('!') || line.contains(":error:") || line.contains(".tex:") {
            out.extend(lines[i..(i + 4).min(lines.len())].iter().copied());
            out.push("");
        }
    }
    if out.is_empty() {
        // Fall back to the tail of the log.
        let start = lines.len().saturating_sub(30);
        lines[start..].join("\n")
    } else {
        out.join("\n")
    }
}

fn compile(source_code: &str) -> Result<String, String> {
    let dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let tex_path = dir.path().join("main.tex");
    let pdf_path = dir.path().join("main.pdf");
    fs::write(&tex_path, source_code).map_err(|e| format!("Failed to write main.tex: {e}"))?;

    let path = search_path();
    let output = if let Some(bin) = find_executable("pdflatex", &path) {
        run_pdflatex(&bin, dir.path(), &path)
    } else if let Some(bin) = find_executable("tectonic", &path) {
        run_tectonic(&bin, dir.path(), &path)
    } else {
        return Err("No LaTeX compiler found. Install TeX Live / MacTeX / MiKTeX (pdflatex) or tectonic.".into());
    }
    .map_err(|e| format!("Failed to start LaTeX compiler: {e}"))?;

    if output.status.success() && pdf_path.is_file() {
        let pdf = fs::read(&pdf_path).map_err(|e| format!("Failed to read PDF: {e}"))?;
        return Ok(STANDARD.encode(pdf));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut msg = format!("Compilation failed (exit code {:?})\n\n", output.status.code());
    msg.push_str(&summarize_log(&stdout));
    if !stderr.trim().is_empty() {
        msg.push_str("\n--- stderr ---\n");
        msg.push_str(stderr.trim());
    }
    Err(msg)
    // `dir` is dropped here and the temp directory is removed.
}

#[tauri::command]
async fn compile_latex(source_code: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || compile(&source_code))
        .await
        .map_err(|e| format!("Compile task panicked: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![compile_latex])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
