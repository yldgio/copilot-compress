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
cp copilot-compress/extension.mjs ~/.copilot/extensions/copilot-compress/
cp copilot-compress/package.json ~/.copilot/extensions/copilot-compress/
cd ~/.copilot/extensions/copilot-compress
npm install --omit=dev
```

#### Windows (pwsh)

```powershell
git clone https://github.com/yldgio/copilot-compress.git
New-Item -ItemType Directory -Force $HOME\.copilot\extensions\copilot-compress | Out-Null
Copy-Item .\copilot-compress\extension.mjs $HOME\.copilot\extensions\copilot-compress -Force
Copy-Item .\copilot-compress\package.json $HOME\.copilot\extensions\copilot-compress -Force
Set-Location $HOME\.copilot\extensions\copilot-compress
npm install --omit=dev
```

Restart Copilot CLI and run `/compress status` to verify installation.

### What gets installed

Installers copy only runtime assets:

- `extension.mjs`
- `package.json`
- `node_modules/@github/copilot-sdk` (via `npm install --omit=dev`)

`src/` is used for development/tests in this repository and is not required at runtime.

## Requirements

- Node.js >= 22
- `@github/copilot-sdk` (installed automatically via `npm install`)

## Contributing

See [AGENTS.md](./AGENTS.md) for architecture rules, invariants, and contributor guidance.
