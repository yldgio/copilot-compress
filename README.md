# copilot-compress

Algorithmic prompt compression extension for Copilot CLI (EN/IT), with session toggle controls.

![Node >=22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)

`copilot-compress` is a Copilot CLI extension that reduces prompt size before messages reach the model. It compresses prose algorithmically (no LLM call) by removing filler/discourse terms while preserving intent.

Compression is session-scoped and opt-in (`/compress on`). You can enable/disable it at any time, toggle verbose stats, and inspect cumulative session savings with `/compress status`.

The extension supports both English and Italian. Language is auto-detected per message, so mixed EN/IT sessions work without manual switching.

## Commands

| Command | Description |
|---|---|
| `/compress on` | Enable compression for the session |
| `/compress off` | Disable compression |
| `/compress verbose` | Toggle per-message stats display |
| `/compress status` | Show current state + session stats |

## How it works

For each message, the pipeline is:

1. Extract code blocks and inline code into placeholders
2. Compress only prose text
3. Restore the original code exactly
4. Append a short compression note to the modified prompt

## Token savings

Using the heuristic `1 token ≈ 4 chars`, prose-heavy prompts typically see ~40–60% character reduction.

## Language support

Language is auto-detected per message (`en`/`it`) with a lightweight heuristic. Italian detection uses `IT_THRESHOLD=0.30`.

## Installation

### 0) Quick install — no clone required

```sh
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/yldgio/copilot-compress/main/install.sh | sh -s -- --remote

# Windows (pwsh) — downloads installer to temp, then runs with -Remote
$f = "$env:TEMP\copilot-compress-install.ps1"
Invoke-WebRequest https://raw.githubusercontent.com/yldgio/copilot-compress/main/install.ps1 -OutFile $f
pwsh $f -Remote
```

This downloads `dist/extension.mjs` and `package.json` directly from the latest GitHub Release, then runs `npm install --omit=dev`. No git clone needed.

To install a specific version:

```sh
# Linux/macOS
sh install.sh --remote v1.2.0

# Windows (pwsh)
pwsh install.ps1 -Remote -Tag v1.2.0
```

### 1) User-wide install (recommended)

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

### 2) Project-scoped install (`.github/extensions/`)

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

### 3) Install from GitHub (clone + copy)

If you prefer manual copy:

#### Linux / macOS

```sh
git clone https://github.com/yldgio/copilot-compress.git
mkdir -p ~/.copilot/extensions/copilot-compress
cp copilot-compress/dist/extension.mjs ~/.copilot/extensions/copilot-compress/
cp copilot-compress/package.json ~/.copilot/extensions/copilot-compress/
cd ~/.copilot/extensions/copilot-compress
npm install --omit=dev
```

#### Windows (pwsh)

```powershell
git clone https://github.com/yldgio/copilot-compress.git
New-Item -ItemType Directory -Force $HOME\.copilot\extensions\copilot-compress | Out-Null
Copy-Item .\copilot-compress\dist\extension.mjs $HOME\.copilot\extensions\copilot-compress -Force
Copy-Item .\copilot-compress\package.json $HOME\.copilot\extensions\copilot-compress -Force
Set-Location $HOME\.copilot\extensions\copilot-compress
npm install --omit=dev
```

Restart Copilot CLI and run `/compress status` to verify installation.

## Development

### Workflow

```
Edit src/ or extension.mjs
→ npm test           (verify — must be 23/23)
→ npm run build      (regenerate dist/)
→ cp dist/extension.mjs .github/extensions/copilot-compress/extension.mjs
→ git add dist/ .github/extensions/ && git commit
```

### Build

The installers deploy `dist/extension.mjs` — a single-file rollup bundle of `extension.mjs` and all `src/` modules. `@github/copilot-sdk` is kept external (not bundled).

```sh
npm run build
```

This writes `dist/extension.mjs`. Commit the result alongside your source changes.

**Always rebuild before committing** if you change `extension.mjs` or any `src/` file.

### Tests

Tests run against `src/` directly (no build required):

```sh
npm test
```

Current suite: **23 tests** (23 pass).

### What gets installed

Installers copy only runtime assets:

- `dist/extension.mjs` (pre-built bundle — includes all `src/` modules)
- `package.json`
- `node_modules/@github/copilot-sdk` (via `npm install --omit=dev`)

### Release

Releases are tag-based. Push a `v*` tag and GitHub Actions does the rest:

```sh
git tag v1.x.x
git push --tags
```

The release workflow runs `npm ci && npm test && npm run build`, verifies the bundle, then publishes a GitHub Release with `dist/extension.mjs`, `package.json`, and the installers as downloadable assets.

## Requirements

- Node.js >= 22
- `@github/copilot-sdk` (installed automatically via `npm install`)

## Contributing

See [AGENTS.md](./AGENTS.md) for architecture rules, invariants, and contributor guidance.
