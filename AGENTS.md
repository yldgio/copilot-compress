# AGENTS.md

## What this repository is

This repository is a **Copilot CLI extension**, not a plugin.

Why: Copilot CLI plugins (`hooks.json`) cannot replace user prompts and do not support bundling `extension.mjs` session logic. Prompt interception/modification requires `joinSession()` from `@github/copilot-sdk/extension` and returning `{ modifiedPrompt }` from `onUserPromptSubmitted`.

## Architecture summary

Core structure:

- `extension.mjs` — entry point; `joinSession()`, slash command registration, hook wiring, session state
- `src/compress.mjs` — pure EN/IT compression algorithm (verbatim upstream copy)
- `src/code-blocks.mjs` — code block extraction/restoration with placeholders
- `src/lang-detect.mjs` — per-message EN/IT detection heuristic (`IT_THRESHOLD=0.30`)
- `dist/extension.mjs` — **committed build artifact**; rollup bundle of `extension.mjs` + all `src/` modules. This is what the installers copy.

Design rule: `src/` has **no external dependencies**. Only `extension.mjs` imports `@github/copilot-sdk/extension`.

## Build

The installers deploy `dist/extension.mjs`, not the raw source files. This single-file bundle is produced by rollup.

| What | Value |
|---|---|
| Source | `extension.mjs` + `src/*.mjs` |
| Output | `dist/extension.mjs` (committed to git) |
| Command | `npm run build` |
| Config | `rollup.config.js` |
| External | `@github/copilot-sdk/extension` (never bundled — installed via npm) |

**Build invariant:** after every change to `extension.mjs` or any `src/` file, run **both** of these commands before committing:

```sh
npm run build
cp dist/extension.mjs .github/extensions/copilot-compress/extension.mjs
```

The `dist/` folder is committed so users can install without a build step. The `.github/extensions/copilot-compress/` directory is gitignored (it's the project-scoped dogfooding install) — keep it in sync manually after every build.

## Key design decisions

1. Slash commands are registered in `joinSession({ commands: [...] })`, not parsed inside `onUserPromptSubmitted` via regex.
2. Code blocks are extracted **before** prose compression and restored **after** compression.
3. Language is auto-detected per message (`en`/`it`) with `IT_THRESHOLD=0.30`.
4. Savings estimates use `1 token ≈ 4 chars`.
5. `src/compress.mjs` is a verbatim copy from source and must be synced from upstream without local divergence.

## Installation

### Quick install — no clone required (agent one-liner)

```sh
# Linux/macOS — latest release
curl -fsSL https://raw.githubusercontent.com/yldgio/copilot-compress/main/install.sh | sh -s -- --remote

# Windows (pwsh) — downloads installer to temp, then runs with -Remote
$f = "$env:TEMP\copilot-compress-install.ps1"
Invoke-WebRequest https://raw.githubusercontent.com/yldgio/copilot-compress/main/install.ps1 -OutFile $f
pwsh $f -Remote
```

### User-wide install (recommended)

#### Linux / macOS

```sh
git clone https://github.com/yldgio/copilot-compress.git
cd copilot-compress
sh install.sh
```

#### Windows (pwsh)

```powershell
git clone https://github.com/yldgio/copilot-compress.git
Set-Location copilot-compress
pwsh .\install.ps1
```

### Project-scoped install (`.github/extensions/`)

#### Linux / macOS

```sh
git clone https://github.com/yldgio/copilot-compress.git
cd /path/to/your-project
sh /path/to/copilot-compress/install.sh --project
```

#### Windows (pwsh)

```powershell
git clone https://github.com/yldgio/copilot-compress.git
Set-Location C:\path\to\your-project
pwsh C:\path\to\copilot-compress\install.ps1 -Project
```

### Manual install from clone (copy-based)

#### Linux / macOS

```sh
git clone https://github.com/yldgio/copilot-compress.git
cp -R copilot-compress ~/.copilot/extensions/copilot-compress
cd ~/.copilot/extensions/copilot-compress
npm install --omit=dev
```

#### Windows (pwsh)

```powershell
git clone https://github.com/yldgio/copilot-compress.git
Copy-Item -Recurse .\copilot-compress $HOME\.copilot\extensions\copilot-compress -Force
Set-Location $HOME\.copilot\extensions\copilot-compress
npm install --omit=dev
```

## Release process

Releases are tag-based. GitHub Actions handles everything:

```sh
git tag v1.x.x
git push --tags
```

The `release.yml` workflow will:
1. `npm ci` + `npm test` (must be 23/23)
2. `npm run build` + verify no local imports in `dist/extension.mjs`
3. Create a GitHub Release with `dist/extension.mjs`, `package.json`, `install.sh`, `install.ps1`, `README.md` as assets

## Testing

Run:

```sh
node --test src/*.test.mjs
```

Current suite total: **23 tests**.

## Extending the extension

### Add a new language

1. Add a filler/phrase list in `src/compress.mjs` and route language-specific passes in `compressText()`.
2. Extend `src/lang-detect.mjs` scoring and thresholds for the new language.
3. Add/expand tests to verify detection + compression behavior.

### Add a new slash command

1. Add command metadata to the `commands[]` array in `extension.mjs`.
2. Dispatch and handle subcommand behavior in `handleCompressCommand`.
3. Return user-facing feedback through `session.log()`.

## Invariants (must not be violated)

1. `src/compress.mjs` is verbatim upstream copy — no local edits.
2. `src/` modules have zero external imports.
3. `onUserPromptSubmitted` must never throw.
4. Command output must use `session.log()` and never `modifiedPrompt`.
5. `dist/extension.mjs` must be rebuilt (`npm run build`) and committed whenever `extension.mjs` or any `src/` file changes.
6. After every `npm run build`, copy `dist/extension.mjs` to `.github/extensions/copilot-compress/extension.mjs` to keep the project-scoped dogfooding install in sync.
