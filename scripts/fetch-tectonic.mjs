import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.17.0";

const ASSETS = {
  "aarch64-apple-darwin": {
    file: `tectonic-${VERSION}-aarch64-apple-darwin.tar.gz`,
    sha256: "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667",
  },
  "x86_64-apple-darwin": {
    file: `tectonic-${VERSION}-x86_64-apple-darwin.tar.gz`,
    sha256: "7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80",
  },
  "x86_64-pc-windows-msvc": {
    file: `tectonic-${VERSION}-x86_64-pc-windows-msvc.zip`,
    sha256: "f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f",
  },
  "x86_64-unknown-linux-gnu": {
    file: `tectonic-${VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    sha256: "8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7",
  },
};

const args = process.argv.slice(2);
const soft = args.includes("--soft");
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? args[targetIndex + 1] : hostTarget();

function hostTarget() {
  try {
    const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
    return out.match(/^host: (.+)$/m)[1].trim();
  } catch {
    const key = `${process.platform}-${process.arch}`;
    return {
      "darwin-arm64": "aarch64-apple-darwin",
      "darwin-x64": "x86_64-apple-darwin",
      "win32-x64": "x86_64-pc-windows-msvc",
      "linux-x64": "x86_64-unknown-linux-gnu",
    }[key];
  }
}

async function main() {
  const asset = ASSETS[target];
  if (!asset) throw new Error(`No bundled Tectonic for target "${target}".`);

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = join(root, "src-tauri", "binaries");
  const exe = target.includes("windows") ? ".exe" : "";
  const dest = join(outDir, `tectonic-${target}${exe}`);
  if (existsSync(dest) && !args.includes("--force")) {
    console.log(`Tectonic ${VERSION} for ${target} already present.`);
    return;
  }

  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/${asset.file}`;
  console.log(`Downloading Tectonic ${VERSION} for ${target}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const data = Buffer.from(await res.arrayBuffer());

  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.file}: got ${digest}`);

  const work = mkdtempSync(join(tmpdir(), "tectonic-"));
  try {
    const archive = join(work, asset.file);
    writeFileSync(archive, data);
    const tar = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
    execFileSync(tar, ["-xf", archive, "-C", work]);
    mkdirSync(outDir, { recursive: true });
    copyFileSync(join(work, `tectonic${exe}`), dest);
    if (!exe) chmodSync(dest, 0o755);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`Saved ${dest}`);
}

main().catch((err) => {
  console.error(`fetch-tectonic: ${err.message}`);
  if (soft) {
    console.error("Continuing without the bundled Tectonic. Run `npm run fetch-tectonic` later.");
  } else {
    process.exit(1);
  }
});
