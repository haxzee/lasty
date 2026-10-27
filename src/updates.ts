import { getVersion } from "@tauri-apps/api/app";
import { api } from "./api";

export const REPOSITORY = "haxzee/lasty";

export interface Update {
  version: string;
  downloadUrl: string;
  releaseUrl: string;
}

interface Release {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

function parse(version: string) {
  return version.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
}

export function isNewer(candidate: string, current: string) {
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function pickAsset(release: Release, os: string, arch: string) {
  const names = release.assets;
  const find = (...suffixes: string[]) =>
    suffixes.map((s) => names.find((a) => a.name.endsWith(s))).find(Boolean)?.browser_download_url;

  if (os === "macos") return arch === "aarch64" ? find("_aarch64.dmg") : find("_x64.dmg");
  if (os === "windows") return find("-setup.exe", ".msi");
  if (os === "linux") return find(".AppImage", ".deb");
  return undefined;
}

export async function checkForUpdate(): Promise<Update | null> {
  const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const release: Release = await res.json();
  if (release.draft || release.prerelease) return null;

  const [current, platform] = await Promise.all([getVersion(), api.platform()]);
  if (!isNewer(release.tag_name, current)) return null;

  return {
    version: release.tag_name.replace(/^v/, ""),
    downloadUrl: pickAsset(release, platform.os, platform.arch) ?? release.html_url,
    releaseUrl: release.html_url,
  };
}
