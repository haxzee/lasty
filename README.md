# Lasty

A local LaTeX editor with live PDF preview for macOS, Windows and Linux. Everything stays on your computer — no accounts, no uploads.

## Features

- Projects are plain folders; create a new one or open an existing folder
- Live preview: saves and recompiles shortly after you stop typing
- VS Code editor (Monaco) with LaTeX highlighting, autocomplete for commands, environments, `\ref`, `\cite` and packages, and automatic `\end{…}`
- pdfLaTeX, XeLaTeX, LuaLaTeX or Tectonic
- Light, Dark and OLED themes; native Liquid Glass on macOS
- Settings with `⌘,` / `Ctrl+,`, editor zoom with `⌘ +` / `⌘ −`

## Requirements

A LaTeX distribution: [MacTeX](https://tug.org/mactex/), [TeX Live](https://tug.org/texlive/), [MiKTeX](https://miktex.org/) or [Tectonic](https://tectonic-typesetting.github.io/).

## Install

Download the installer for your system from the [latest release](../../releases/latest).

The macOS build is not signed. On first launch, right-click the app and choose **Open**, or run:

```sh
xattr -cr /Applications/Lasty.app
```

## Development

```sh
npm install
npm run tauri dev
```

Releases are built by GitHub Actions when a `v*` tag is pushed.
