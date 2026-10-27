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

export const api = {
  recentProjects: () => invoke<RecentProject[]>("get_recent_projects"),
  lastProject: () => invoke<string | null>("get_last_project"),
  openProject: (path: string) => invoke<ProjectInfo>("open_project", { path }),
  createProject: (parent: string, name: string) =>
    invoke<ProjectInfo>("create_project", { parent, name }),
  closeProject: () => invoke<void>("close_project"),
  forgetProject: (path: string) => invoke<void>("forget_project", { path }),
  setMainFile: (root: string, file: string) => invoke<void>("set_main_file", { root, file }),
  listFiles: (root: string) => invoke<FileEntry[]>("list_files", { root }),
  readFile: (root: string, file: string) => invoke<string>("read_file", { root, file }),
  writeFile: (root: string, file: string, content: string) =>
    invoke<void>("write_file", { root, file, content }),
  createFile: (root: string, file: string) => invoke<void>("create_file", { root, file }),
  compile: (root: string, mainFile: string, engine: string) =>
    invoke<string>("compile_project", { root, mainFile, engine }),
  getSettings: () => invoke<Record<string, unknown> | null>("get_settings"),
  saveSettings: (settings: object) => invoke<void>("save_settings", { settings }),
};

const TEXT_EXTENSIONS = ["tex", "bib", "sty", "cls", "bst", "txt", "md", "cfg", "def", "ltx", "dtx"];

export function isEditable(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.includes(ext);
}
