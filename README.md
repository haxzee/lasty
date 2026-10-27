# Lasty

A local LaTeX editor with live PDF preview for macOS, Windows and Linux. Everything stays on your computer — no accounts, no uploads.

## Features

- Projects are plain folders; create a new one or open an existing folder
- Live preview: saves and recompiles shortly after you stop typing
- VS Code editor (Monaco) with LaTeX highlighting, autocomplete for commands, environments, `\ref`, `\cite` and packages, and automatic `\end{…}`
- Built-in Tectonic engine, or an installed pdfLaTeX, XeLaTeX or LuaLaTeX
- Light, Dark and OLED themes; native Liquid Glass on macOS
- Settings with `⌘,` / `Ctrl+,`, editor zoom with `⌘ +` / `⌘ −`

## Requirements

None. Lasty ships with the [Tectonic](https://tectonic-typesetting.github.io/) LaTeX engine. The first compile downloads the LaTeX packages your document uses (usually 20–50 MB) and caches them; after that it works offline.

If [MacTeX](https://tug.org/mactex/), [TeX Live](https://tug.org/texlive/) or [MiKTeX](https://miktex.org/) is installed, Lasty uses its pdfLaTeX instead. XeLaTeX and LuaLaTeX can be picked in Settings when installed.

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

`npm install` also downloads the Tectonic binary for your platform into `src-tauri/binaries` (checksum-verified).

Releases are built by GitHub Actions when a `v*` tag is pushed.

## Contributing

Contributions are welcome. Fork the repository, create a branch and open a pull request against `master`. Every pull request is built and tested automatically; please make sure `npm run build` and `cargo test` (in `src-tauri`) pass.

## License

[MIT](LICENSE). Lasty bundles the Tectonic engine, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
