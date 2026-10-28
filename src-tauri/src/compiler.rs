use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::Read;
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

fn command(bin: &Path) -> Command {
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn run_tex(bin: &Path, root: &Path, main: &str, out: &Path, path: &OsString) -> std::io::Result<Output> {
    command(bin)
        .current_dir(root)
        .env("PATH", path)
        .arg("-interaction=nonstopmode")
        .arg("-halt-on-error")
        .arg("-no-shell-escape")
        .arg("-file-line-error")
        .arg("-synctex=-1")
        .arg(format!("-output-directory={}", out.display()))
        .arg(main)
        .output()
}

fn run_tectonic(bin: &Path, root: &Path, main: &str, out: &Path, path: &OsString) -> std::io::Result<Output> {
    command(bin)
        .current_dir(root)
        .env("PATH", path)
        .args(["--chatter", "minimal", "--synctex", "--outdir"])
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

/// The compilers that can run on this machine, in the order Settings lists them.
pub fn available_engines(bundled_tectonic: Option<&Path>) -> Vec<String> {
    let path = search_path();
    let mut out: Vec<String> = TEX_ENGINES
        .iter()
        .filter(|e| find_executable(e, &path).is_some())
        .map(|e| e.to_string())
        .collect();
    if find_tectonic(&path, bundled_tectonic).is_some() {
        out.push("tectonic".into());
    }
    out
}

fn find_tectonic(path: &OsString, bundled: Option<&Path>) -> Option<PathBuf> {
    find_executable("tectonic", path).or_else(|| bundled.filter(|b| b.is_file()).map(Path::to_path_buf))
}

#[derive(serde::Serialize)]
pub struct CompileOutput {
    /// Base64-encoded PDF.
    pub pdf: String,
    /// Uncompressed SyncTeX data, when the engine produced it.
    pub synctex: Option<String>,
}

fn read_synctex(pdf_path: &Path) -> Option<String> {
    if let Ok(text) = fs::read_to_string(pdf_path.with_extension("synctex")) {
        return Some(text);
    }
    let gz = fs::File::open(pdf_path.with_extension("synctex.gz")).ok()?;
    let mut text = String::new();
    flate2::read::GzDecoder::new(gz).read_to_string(&mut text).ok()?;
    Some(text)
}

pub fn compile(root: &Path, main: &str, engine: &str, bundled_tectonic: Option<&Path>) -> Result<CompileOutput, String> {
    let out = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let pdf_name = Path::new(main).with_extension("pdf");
    let pdf_path = out.path().join(pdf_name.file_name().unwrap_or_default());

    let path = search_path();
    let output = match engine {
        "auto" => {
            if let Some(bin) = find_executable("pdflatex", &path) {
                run_tex(&bin, root, main, out.path(), &path)
            } else if let Some(bin) = find_tectonic(&path, bundled_tectonic) {
                run_tectonic(&bin, root, main, out.path(), &path)
            } else {
                return Err("No LaTeX compiler found. Reinstall Lasty, or install TeX Live / MacTeX / MiKTeX.".into());
            }
        }
        "tectonic" => {
            let bin = find_tectonic(&path, bundled_tectonic).ok_or_else(|| not_found("tectonic"))?;
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
        return Ok(CompileOutput { pdf: STANDARD.encode(pdf), synctex: read_synctex(&pdf_path) });
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

    fn compile_source(src: &str) -> Result<CompileOutput, String> {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), src).unwrap();
        let result = compile(dir.path(), "main.tex", "auto", None);
        assert!(!dir.path().join("main.aux").exists());
        result
    }

    #[test]
    fn compiles_minimal_document() {
        let out = compile_source(r"\documentclass{article}\begin{document}Hello\end{document}")
            .expect("should compile");
        let pdf = STANDARD.decode(out.pdf).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
        assert!(out.synctex.is_some_and(|s| s.contains("Input:")));
    }

    #[test]
    fn reports_errors() {
        let Err(err) = compile_source(r"\documentclass{article}\begin{document}\undefinedcmd\end{document}") else {
            panic!("should fail");
        };
        assert!(err.contains("Undefined control sequence"), "{err}");
    }

    #[test]
    fn rejects_unknown_engine() {
        let dir = tempfile::tempdir().unwrap();
        let Err(err) = compile(dir.path(), "main.tex", "word", None) else { panic!("should fail") };
        assert!(err.contains("Unknown compiler"), "{err}");
    }

    #[test]
    fn compiles_with_xelatex_when_available() {
        if find_executable("xelatex", &search_path()).is_none() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), r"\documentclass{article}\begin{document}Grüße\end{document}").unwrap();
        compile(dir.path(), "main.tex", "xelatex", None).expect("xelatex should compile");
    }

    fn bundled_binary() -> Option<PathBuf> {
        fs::read_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries"))
            .ok()?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("tectonic-")))
    }

    #[test]
    #[ignore = "needs network on first run to fetch LaTeX packages"]
    fn bundled_tectonic_compiles() {
        let bin = bundled_binary().expect("run `npm run fetch-tectonic` first");
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.tex"), r"\documentclass{article}\begin{document}Hi\end{document}").unwrap();
        compile(dir.path(), "main.tex", "tectonic", Some(&bin)).expect("bundled tectonic should compile");
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
        compile(dir.path(), "main.tex", "auto", None).expect("should compile with \\input");
    }
}
