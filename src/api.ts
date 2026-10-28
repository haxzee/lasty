import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
}

export interface ProjectInfo {
  path: string;
  name: string;
  mainFile: string;
  files: FileEntry[];
}

export interface RecentProject {
  path: string;
  name: string;
  mainFile: string;
  lastOpened: number;
  exists: boolean;
}

export interface CompileOutput {
  pdf: string;
  synctex: string | null;
}

export interface Snapshot {
  id: string;
  created: number;
  label: string;
  auto: boolean;
  files: number;
}

export type Template = "article" | "thesis" | "beamer" | "letter";

export const api = {
  recentProjects: () => invoke<RecentProject[]>("get_recent_projects"),
  lastProject: () => invoke<string | null>("get_last_project"),
  openProject: (path: string) => invoke<ProjectInfo>("open_project", { path }),
  createProject: (parent: string, name: string, template: Template) =>
    invoke<ProjectInfo>("create_project", { parent, name, template }),
  closeProject: () => invoke<void>("close_project"),
  forgetProject: (path: string) => invoke<void>("forget_project", { path }),
  setMainFile: (root: string, file: string) => invoke<void>("set_main_file", { root, file }),
  listFiles: (root: string) => invoke<FileEntry[]>("list_files", { root }),
  readFile: (root: string, file: string) => invoke<string>("read_file", { root, file }),
  writeFile: (root: string, file: string, content: string) =>
    invoke<void>("write_file", { root, file, content }),
  createFile: (root: string, file: string) => invoke<void>("create_file", { root, file }),
  createFolder: (root: string, path: string) => invoke<void>("create_folder", { root, path }),
  renamePath: (root: string, from: string, to: string) => invoke<void>("rename_path", { root, from, to }),
  deletePath: (root: string, path: string) => invoke<void>("delete_path", { root, path }),
  importFiles: (root: string, sources: string[], destDir: string) =>
    invoke<string[]>("import_files", { root, sources, destDir }),
  fileModified: (root: string, file: string) => invoke<number>("file_modified", { root, file }),
  exportPdf: (dest: string, pdf: string) => invoke<void>("export_pdf", { dest, pdf }),
  listSnapshots: (root: string) => invoke<Snapshot[]>("list_snapshots", { root }),
  createSnapshot: (root: string, label: string, auto: boolean) =>
    invoke<Snapshot>("create_snapshot", { root, label, auto }),
  restoreSnapshot: (root: string, id: string) => invoke<void>("restore_snapshot", { root, id }),
  deleteSnapshot: (root: string, id: string) => invoke<void>("delete_snapshot", { root, id }),
  readSnapshotFile: (root: string, id: string, file: string) =>
    invoke<string>("read_snapshot_file", { root, id, file }),
  spellCheck: (lang: string, words: string[]) => invoke<string[]>("spell_check", { lang, words }),
  spellSuggest: (lang: string, word: string) => invoke<string[]>("spell_suggest", { lang, word }),
  compile: (root: string, mainFile: string, engine: string) =>
    invoke<CompileOutput>("compile_project", { root, mainFile, engine }),
  getSettings: () => invoke<Record<string, unknown> | null>("get_settings"),
  saveSettings: (settings: object) => invoke<void>("save_settings", { settings }),
  platform: () => invoke<{ os: string; arch: string }>("platform"),
};

const TEXT_EXTENSIONS = ["tex", "bib", "sty", "cls", "bst", "txt", "md", "cfg", "def", "ltx", "dtx"];

export function isEditable(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.includes(ext);
}
