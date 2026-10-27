mod compiler;
mod project;

use project::{FileEntry, ProjectInfo, RecentProject, Store};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

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
) -> Result<ProjectInfo, String> {
    let root = project::create_project(&project_root(&parent)?, &name)?;
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

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("settings.json"))
        .map_err(|e| e.to_string())
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

#[tauri::command]
async fn compile_project(root: String, main_file: String, engine: Option<String>) -> Result<String, String> {
    let root_path = project_root(&root)?;
    project::resolve(&root_path, &main_file)?;
    let engine = engine.unwrap_or_else(|| "auto".into());
    tauri::async_runtime::spawn_blocking(move || compiler::compile(&root_path, &main_file, &engine))
        .await
        .map_err(|e| format!("Compile task panicked: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StoreLock(Mutex::new(())))
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
            compile_project,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
