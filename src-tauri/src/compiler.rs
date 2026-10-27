use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

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

fn run_tex(bin: &Path, root: &Path, main: &str, out: &Path, path: &OsString) -> std::io::Result<Output> {
    Command::new(bin)
        .current_dir(root)
        .env("PATH", path)
        .arg("-interaction=nonstopmode")
        .arg("-halt-on-error")
        .arg("-no-shell-escape")
        .arg("-file-line-error")
        .arg(format!("-output-directory={}", out.display()))
        .arg(main)
        .output()
}

fn run_tectonic(bin: &Path, root: &Path, main: &str, out: &Path, path: &OsString) -> std::io::Result<Output> {
    Command::new(bin)
        .current_dir(root)
        .env("PATH", path)
        .args(["--chatter", "minimal", "--outdir"])
        .arg(out)
        .arg(main)
        .output()
}

fn not_found(engine: &str) -> String {
    format!("{engine} was not found. Install it, or pick another compiler in Settings.")
}

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
        let start = lines.len().saturating_sub(30);
        lines[start..].join("\n")
    } else {
        out.join("\n")
    }
}

const TEX_ENGINES: &[&str] = &["pdflatex", "xelatex", "lualatex"];

pub fn compile(root: &Path, main: &str, engine: &str) -> Result<String, String> {
    let out = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let pdf_name = Path::new(main).with_extension("pdf");
    let pdf_path = out.path().join(pdf_name.file_name().unwrap_or_default());

    let path = search_path();
    let output = match engine {
        "auto" => {
            if let Some(bin) = find_executable("pdflatex", &path) {
                run_tex(&bin, root, main, out.path(), &path)
            } else if let Some(bin) = find_executable("tectonic", &path) {
                run_tectonic(&bin, root, main, out.path(), &path)
            } else {
                return Err("No LaTeX compiler found. Install TeX Live / MacTeX / MiKTeX (pdflatex) or tectonic.".into());
            }
        }
        "tectonic" => {
            let bin = find_executable("tectonic", &path).ok_or_else(|| not_found("tectonic"))?;
            run_tectonic(&bin, root, main, out.path(), &path)
        }
        name if TEX_ENGINES.contains(&name) => {
            let bin = find_executable(name, &path).ok_or_else(|| not_found(name))?;
            run_tex(&bin, root, main, out.path(), &path)
        }
        other => return Err(format!("Unknown compiler: {other}")),
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile_source(src: &str) -> Result<String, String> {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), src).unwrap();
        let result = compile(dir.path(), "main.tex", "auto");
        assert!(!dir.path().join("main.aux").exists());
        result
    }

    #[test]
    fn compiles_minimal_document() {
        let b64 = compile_source(r"\documentclass{article}\begin{document}Hello\end{document}")
            .expect("should compile");
        let pdf = STANDARD.decode(b64).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
    }

    #[test]
    fn reports_errors() {
        let err = compile_source(r"\documentclass{article}\begin{document}\undefinedcmd\end{document}")
            .unwrap_err();
        assert!(err.contains("Undefined control sequence"), "{err}");
    }

    #[test]
    fn rejects_unknown_engine() {
        let dir = tempfile::tempdir().unwrap();
        let err = compile(dir.path(), "main.tex", "word").unwrap_err();
        assert!(err.contains("Unknown compiler"), "{err}");
    }

    #[test]
    fn compiles_with_xelatex_when_available() {
        if find_executable("xelatex", &search_path()).is_none() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), r"\documentclass{article}\begin{document}Grüße\end{document}").unwrap();
        compile(dir.path(), "main.tex", "xelatex").expect("xelatex should compile");
    }

    #[test]
    fn resolves_inputs_relative_to_project() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("chapters")).unwrap();
        fs::write(dir.path().join("chapters/intro.tex"), "Intro text").unwrap();
        fs::write(
            dir.path().join("main.tex"),
            r"\documentclass{article}\begin{document}\input{chapters/intro}\end{document}",
        )
        .unwrap();
        compile(dir.path(), "main.tex", "auto").expect("should compile with \\input");
    }
}
