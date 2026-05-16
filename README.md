# markdv

Cross-platform Markdown viewer built with Tauri v2, React, TypeScript, and Vite.

markdv is intended to be a command-line-driven desktop viewer:

- open a markdown file by passing its path as a command-line argument
- render markdown to sanitized HTML with `markdown-it`
- show a heading-based table of contents
- hot-reload the preview when the source file changes on disk
- keep the frontend minimal: display and navigation only

## Stack

- Tauri v2
- React 19
- TypeScript
- Vite
- markdown-it
- DOMPurify
- highlight.js
- notify for native file watching in Rust

## Primary Usage

Run the compiled app directly with a markdown file path:

```bash
./src-tauri/target/release/markdv /home/g/z/markdv/demo.md
```

If the binary is on your PATH, the intended usage is simply:

```bash
markdv demo.md
```

Relative paths work and are resolved from the current shell working directory.

Window size and position can also be provided on the command line:

```bash
markdv demo.md -w 1440 -h 900 -x 24 -y 24
```

Supported window arguments:

```text
-w WIDTH, --width WIDTH    Window width
-h HEIGHT, --height HEIGHT Window height
-x X                       Window x position
-y Y                       Window y position
--help                     Show this help message and exit
```

If `-x` and `-y` are omitted, the window opens near the top-left corner with a small default offset.

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode without a file:

```bash
npm run tauri dev
```

Run the desktop app in development mode with a markdown file argument:

```bash
npm run tauri -- dev -- demo.md
```

If your shell/npm forwarding needs explicit app arguments, Tauri also accepts:

```bash
npm run tauri -- dev -- -- demo.md
```

Build the frontend bundle:

```bash
npm run build
```

Build Linux desktop packages:

```bash
npm run tauri build -- --bundles deb,rpm
```

Build Windows desktop packages

```bash
npm run tauri build -- --bundles msi,nsis
```

Build all bundle types configured for the current platform:

```bash
npm run tauri build
```

Initialize cargo-dist from the repository root:

```bash
npm run dist:init
```

This repo uses a virtual Cargo workspace at the root so release tooling can discover the Tauri crate in `src-tauri`.

## Release

This repository should run `cargo-dist` from the repository root, not from `src-tauri`.

Common release-related commands from the root:

```bash
# initialize or update cargo-dist config
npm run dist:init

# inspect what CI will build without producing artifacts
npm run release:plan

# build release artifacts for the current machine
npm run release:local
```

If you want to call `dist` directly, the equivalent commands are:

```bash
dist init --yes
dist plan
dist build
```

Release flow:

```bash
# inspect what the CI release matrix will build
npm run release:plan

# optionally build artifacts for the current machine
npm run release:local

# push commits first
git push

# create and push the version tag that triggers the GitHub Release workflow
git tag v0.1.0
git push origin v0.1.0
```

Notes:

- Pushing a version tag is what triggers `.github/workflows/release.yml` and publishes artifacts to GitHub Releases.
- Pushing normal commits without a version tag does not publish a release.
- The current `cargo-dist` targets are macOS `aarch64`, macOS `x86_64`, Linux `x86_64`, and Windows `x86_64`.
- The current release setup publishes archives, checksum files, and command-line installers to GitHub Releases.
- This repository keeps a small manual patch in the generated release workflow for Linux system dependencies, so `dist-workspace.toml` allows dirty `ci` output.

Command-line installation:

After a release is published, `cargo-dist` provides direct installer scripts for Unix-like shells and PowerShell.

Unix-like shells:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/GZJ/markdv/releases/download/v0.1.0/markdv-installer.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/GZJ/markdv/releases/download/v0.1.0/markdv-installer.ps1 | iex
```

If you prefer not to use the installer scripts, you can still download the platform archive from GitHub Releases and place the extracted binary on your `PATH` manually.

After installation, you can run:

```bash
markdv demo.md
```

## Project Layout

- `src/App.tsx` — viewer state and startup path loading
- `src/components/TocSidebar.tsx` — heading outline navigation
- `src/components/MarkdownPreview.tsx` — rendered HTML preview pane
- `src/lib/markdown.ts` — markdown rendering and sanitization
- `src/lib/toc.ts` — heading slug and TOC helpers
- `src-tauri/src/lib.rs` — launch argument parsing, file read, and file watch commands for Tauri

## Notes

- This is a viewer-first app. Editing is intentionally out of scope for the current version.
- Current reading shortcuts: `j` / `k` scroll, `d` / `u` half-page scroll, `gg` top, `Shift+g` bottom, `t` toggle TOC, `r` reload.
- Hot reload is driven by native file watching in the Tauri backend.
- On this Linux machine, `tauri build` reaches `.deb` and `.rpm` packaging successfully, but AppImage bundling currently fails at the `linuxdeploy` step.
