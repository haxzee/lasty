mod compiler;
mod project;
mod snapshots;
mod spell;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use project::{FileEntry, ProjectInfo, RecentProject, Store};
use snapshots::Snapshot;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager, State};

struct StoreLock(Mutex<()>);

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("projects.json"))
        .map_err(|e| e.to_string())
}

fn with_store<T>(
    app: &AppHandle,
    lock: &State<StoreLock>,
    f: impl FnOnce(&mut Store) -> T,
) -> Result<T, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let file = store_path(app)?;
    let mut store = project::load_store(&file);
    let result = f(&mut store);
    project::save_store(&file, &store)?;
    Ok(result)
}

fn project_root(path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }
    Ok(root)
}

fn load_project(app: &AppHandle, lock: &State<StoreLock>, root: &Path) -> Result<ProjectInfo, String> {
    let path = root.to_string_lossy().into_owned();
    let name = project::project_name(root);
    let files = project::list_files(root);
    let main_file = with_store(app, lock, |s| {
        let main = s
            .main_file_for(&path)
            .filter(|m| root.join(m).is_file())
            .unwrap_or_else(|| project::detect_main(root, &files));
        s.touch(&path, &name, &main);
        main
    })?;
    Ok(ProjectInfo { path, name, main_file, files })
}

#[tauri::command]
fn get_recent_projects(app: AppHandle, lock: State<StoreLock>) -> Result<Vec<RecentProject>, String> {
    with_store(&app, &lock, |s| s.recent_with_status())
}

#[tauri::command]
fn get_last_project(app: AppHandle, lock: State<StoreLock>) -> Result<Option<String>, String> {
    with_store(&app, &lock, |s| s.last_open.clone().filter(|p| Path::new(p).is_dir()))
}

#[tauri::command]
fn open_project(app: AppHandle, lock: State<StoreLock>, path: String) -> Result<ProjectInfo, String> {
    load_project(&app, &lock, &project_root(&path)?)
}

#[tauri::command]
fn create_project(
    app: AppHandle,
    lock: State<StoreLock>,
    parent: String,
    name: String,
    template: Option<String>,
) -> Result<ProjectInfo, String> {
    let root = project::create_project(&project_root(&parent)?, &name, template.as_deref().unwrap_or("article"))?;
    load_project(&app, &lock, &root)
}

#[tauri::command]
fn close_project(app: AppHandle, lock: State<StoreLock>) -> Result<(), String> {
    with_store(&app, &lock, |s| s.last_open = None)
}

#[tauri::command]
fn forget_project(app: AppHandle, lock: State<StoreLock>, path: String) -> Result<(), String> {
    with_store(&app, &lock, |s| s.forget(&path))
}

#[tauri::command]
fn set_main_file(app: AppHandle, lock: State<StoreLock>, root: String, file: String) -> Result<(), String> {
    let root_path = project_root(&root)?;
    project::resolve(&root_path, &file)?;
    let name = project::project_name(&root_path);
    with_store(&app, &lock, |s| s.touch(&root, &name, &file))
}

#[tauri::command]
fn list_files(root: String) -> Result<Vec<FileEntry>, String> {
    Ok(project::list_files(&project_root(&root)?))
}

#[tauri::command]
fn read_file(root: String, file: String) -> Result<String, String> {
    let path = project::resolve(&project_root(&root)?, &file)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {file}: {e}"))
}

#[tauri::command]
fn write_file(root: String, file: String, content: String) -> Result<(), String> {
    let path = project::resolve(&project_root(&root)?, &file)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to save {file}: {e}"))
}

#[tauri::command]
fn create_file(root: String, file: String) -> Result<(), String> {
    let path = project::resolve(&project_root(&root)?, &file)?;
    if path.exists() {
        return Err(format!("{file} already exists."));
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, "").map_err(|e| format!("Failed to create {file}: {e}"))
}

#[tauri::command]
fn create_folder(root: String, path: String) -> Result<(), String> {
    let dir = project::resolve(&project_root(&root)?, &path)?;
    if dir.exists() {
        return Err(format!("{path} already exists."));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {path}: {e}"))
}

#[tauri::command]
fn rename_path(root: String, from: String, to: String) -> Result<(), String> {
    project::rename(&project_root(&root)?, &from, &to)
}

#[tauri::command]
fn delete_path(root: String, path: String) -> Result<(), String> {
    let target = project::resolve(&project_root(&root)?, &path)?;
    if trash::delete(&target).is_ok() {
        return Ok(());
    }
    let result = if target.is_dir() { fs::remove_dir_all(&target) } else { fs::remove_file(&target) };
    result.map_err(|e| format!("Failed to delete {path}: {e}"))
}

#[tauri::command]
fn import_files(root: String, sources: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    project::import(&project_root(&root)?, &sources, &dest_dir)
}

/// Last modification time in milliseconds, used to notice edits made outside Lasty.
#[tauri::command]
fn file_modified(root: String, file: String) -> Result<u64, String> {
    let path = project::resolve(&project_root(&root)?, &file)?;
    let modified = fs::metadata(&path).and_then(|m| m.modified()).map_err(|e| e.to_string())?;
    Ok(modified.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
}

#[tauri::command]
fn export_pdf(dest: String, pdf: String) -> Result<(), String> {
    let bytes = STANDARD.decode(pdf).map_err(|e| e.to_string())?;
    fs::write(&dest, bytes).map_err(|e| format!("Failed to save PDF: {e}"))
}

#[tauri::command]
fn list_snapshots(root: String) -> Result<Vec<Snapshot>, String> {
    Ok(snapshots::list(&project_root(&root)?))
}

#[tauri::command]
fn create_snapshot(root: String, label: String, auto: bool) -> Result<Snapshot, String> {
    snapshots::create(&project_root(&root)?, &label, auto)
}

#[tauri::command]
fn restore_snapshot(root: String, id: String) -> Result<(), String> {
    snapshots::restore(&project_root(&root)?, &id)
}

#[tauri::command]
fn delete_snapshot(root: String, id: String) -> Result<(), String> {
    snapshots::delete(&project_root(&root)?, &id)
}

#[tauri::command]
fn read_snapshot_file(root: String, id: String, file: String) -> Result<String, String> {
    snapshots::read_file(&project_root(&root)?, &id, &file)
}

fn dictionaries_dir(app: &AppHandle) -> PathBuf {
    let bundled = app.path().resource_dir().map(|d| d.join("dictionaries")).unwrap_or_default();
    if bundled.is_dir() {
        bundled
    } else {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries")
    }
}

#[tauri::command]
async fn spell_check(app: AppHandle, lang: String, words: Vec<String>) -> Result<Vec<String>, String> {
    let dir = dictionaries_dir(&app);
    tauri::async_runtime::spawn_blocking(move || app.state::<spell::Spell>().check(&dir, &lang, words))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn spell_suggest(app: AppHandle, lang: String, word: String) -> Result<Vec<String>, String> {
    let dir = dictionaries_dir(&app);
    tauri::async_runtime::spawn_blocking(move || app.state::<spell::Spell>().suggest(&dir, &lang, &word))
        .await
        .map_err(|e| e.to_string())?
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("settings.json"))
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct Platform {
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn platform() -> Platform {
    Platform { os: std::env::consts::OS, arch: std::env::consts::ARCH }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let file = settings_path(&app)?;
    Ok(fs::read_to_string(file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let file = settings_path(&app)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(file, json).map_err(|e| format!("Failed to save settings: {e}"))
}

fn bundled_tectonic() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bin = exe.parent()?.join(format!("tectonic{}", std::env::consts::EXE_SUFFIX));
    bin.is_file().then_some(bin)
}

#[tauri::command]
async fn compile_project(
    root: String,
    main_file: String,
    engine: Option<String>,
) -> Result<compiler::CompileOutput, String> {
    let root_path = project_root(&root)?;
    project::resolve(&root_path, &main_file)?;
    let engine = engine.unwrap_or_else(|| "auto".into());
    tauri::async_runtime::spawn_blocking(move || compiler::compile(&root_path, &main_file, &engine, bundled_tectonic().as_deref()))
        .await
        .map_err(|e| format!("Compile task panicked: {e}"))?
}

/// macOS menu without "Close Window", so ⌘W closes the current tab instead.
#[cfg(target_os = "macos")]
fn app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem as P, Submenu};
    let close_tab = MenuItem::with_id(app, "close-tab", "Close Tab", true, Some("CmdOrCtrl+W"))?;
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Lasty",
                true,
                &[
                    &P::about(app, None, None)?,
                    &P::separator(app)?,
                    &P::services(app, None)?,
                    &P::separator(app)?,
                    &P::hide(app, None)?,
                    &P::hide_others(app, None)?,
                    &P::show_all(app, None)?,
                    &P::separator(app)?,
                    &P::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(app, "File", true, &[&close_tab])?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &P::undo(app, None)?,
                    &P::redo(app, None)?,
                    &P::separator(app)?,
                    &P::cut(app, None)?,
                    &P::copy(app, None)?,
                    &P::paste(app, None)?,
                    &P::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[&P::minimize(app, None)?, &P::maximize(app, None)?, &P::separator(app)?, &P::fullscreen(app, None)?],
            )?,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(app_menu)
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().as_ref());
        });
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StoreLock(Mutex::new(())))
        .manage(spell::Spell::default())
        .invoke_handler(tauri::generate_handler![
            get_recent_projects,
            get_last_project,
            open_project,
            create_project,
            close_project,
            forget_project,
            set_main_file,
            list_files,
            read_file,
            write_file,
            create_file,
            create_folder,
            rename_path,
            delete_path,
            import_files,
            file_modified,
            export_pdf,
            list_snapshots,
            create_snapshot,
            restore_snapshot,
            delete_snapshot,
            read_snapshot_file,
            spell_check,
            spell_suggest,
            compile_project,
            get_settings,
            save_settings,
            platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
