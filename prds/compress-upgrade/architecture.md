# Architecture: copilot-compress v2 Upgrade

**Date:** 2025-01-01
**Status:** Proposed
**Author:** Hugo (Senior Software Architect)
**Baseline:** `extension.mjs` + `src/{compress,code-blocks,lang-detect}.mjs` (23 tests, 103/94/45/39 LOC)

---

## 1. Current State (verified from source)

### Existing pipeline (`extension.mjs:62–100`)

```
onUserPromptSubmitted(input)
  │
  ├─ pass-through: !compressEnabled || text empty
  │
  └─ extractCodeBlocks(text)            → { stripped, slots }   // code-blocks.mjs
       detectLang(stripped)             → 'en' | 'it'           // lang-detect.mjs
       compressText(stripped, lang)     → compressedStripped     // compress.mjs
       restoreCodeBlocks(compressed, slots) → finalText
       finalText + note → { modifiedPrompt }
```

### Existing session state (`extension.mjs:14–17`)

```js
let compressEnabled = false;
let verboseMode     = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0 };
```

### Existing commands (`extension.mjs:23–49`)

`on | off | verbose | status` — all dispatched from `context.args`

### What current code does NOT do

- No intensity levels — single compression mode only
- No code comment stripping — slots preserved 100% verbatim
- No data format detection — JSON/YAML passed through compressText
- No safety gates — all prompts compressed regardless of length/content
- No tool output compression — no `onToolResult` hook
- No domain modes — single generic compress
- No post-compression validation
- Token estimate hardcoded to `chars / 4` (`extension.mjs:89`)

---

## 2. Target Architecture

### 2.1 Module Map

```
copilot-compress/
├── extension.mjs                  ← MODIFIED  (new state, commands, onToolResult)
├── src/
│   ├── compress.mjs               ← MODIFIED  (intensity param, deeper filler taxonomy)
│   ├── code-blocks.mjs            ← MODIFIED  (expose language tag from fenced slots)
│   ├── lang-detect.mjs            ← UNCHANGED
│   │
│   ├── intensity.mjs              ← NEW  feature-gate matrix for none/minimal/aggressive
│   ├── comment-strip.mjs          ← NEW  language-aware comment removal inside code slots
│   ├── data-format.mjs            ← NEW  JSON/YAML/TOML/CSV/XML detection + bypass
│   ├── safety.mjs                 ← NEW  clarity gate (sentence length, proper noun ratio)
│   ├── validator.mjs              ← NEW  post-compression invariant checks
│   ├── tool-compress.mjs          ← NEW  tool output compression (grep/view/bash strategies)
│   ├── domain.mjs                 ← NEW  commit/review mode transforms
│   └── token-estimate.mjs         ← NEW  per-model token divisors
│
│   (each new src/ module ships a corresponding .test.mjs)
│
├── rollup.config.js               ← UNCHANGED
└── package.json                   ← test script updated (see §10)
```

### 2.2 Import Graph

```
extension.mjs
  ├── @github/copilot-sdk/extension   [external — rollup does NOT bundle]
  ├── src/compress.mjs
  ├── src/code-blocks.mjs
  ├── src/lang-detect.mjs
  ├── src/intensity.mjs
  ├── src/comment-strip.mjs
  ├── src/data-format.mjs
  ├── src/safety.mjs
  ├── src/validator.mjs
  ├── src/tool-compress.mjs
  ├── src/domain.mjs
  └── src/token-estimate.mjs

src/* modules → zero external imports, zero cross-src imports
               (each is a pure-function island; extension.mjs is the only wiring point)
```

**Invariant preserved:** `src/` modules import nothing outside of Node.js builtins. No module imports another `src/` module. The composition root is `extension.mjs` exclusively.

---

## 3. Compression Pipeline (v2)

### 3.1 Full Sequence

```
onUserPromptSubmitted(input)
 │
 ├─ [0] PASS-THROUGH GATES
 │       !compressEnabled → return undefined
 │       text.trim() === '' → return undefined
 │
 ├─ [1] DATA FORMAT BYPASS                          data-format.mjs
 │       isSafeToCompress(text) === false → return undefined
 │       (entire prompt is JSON / YAML / TOML / CSV / XML)
 │
 ├─ [2] EXTRACT CODE BLOCKS                         code-blocks.mjs
 │       extractCodeBlocks(text)
 │       → { stripped: string, slots: Map<slotKey, { raw, lang }> }
 │       Note: slots now carry the parsed language tag (e.g. 'python', 'go')
 │
 ├─ [3] CODE BLOCK TRANSFORMS                       comment-strip.mjs
 │       (only when intensity === 'aggressive')
 │       for each fenced slot with a known lang tag:
 │         slot.raw = stripComments(slot.raw, slot.lang)
 │       (structure collapse lives here too — see §4.3)
 │
 ├─ [4] SAFETY GATE                                 safety.mjs
 │       checkSafety(stripped, intensity)
 │       .safe === false → return undefined
 │       (short-circuit; code transforms already applied to slots but that is safe)
 │
 ├─ [5] LANGUAGE DETECT                             lang-detect.mjs
 │       detectLang(stripped) → 'en' | 'it'         (UNCHANGED)
 │
 ├─ [6] DOMAIN TRANSFORMS                           domain.mjs
 │       domainMode !== null →
 │         stripped = applyDomainTransforms(stripped, domainMode)
 │
 ├─ [7] FILLER COMPRESSION                          compress.mjs
 │       compressText(stripped, lang, intensity) → compressedStripped
 │       (intensity controls which filler categories fire — see §4)
 │
 ├─ [8] RESTORE CODE BLOCKS                         code-blocks.mjs
 │       restoreCodeBlocks(compressedStripped, slots) → finalText
 │       (slots contain potentially comment-stripped code from step 3)
 │
 ├─ [9] POST-COMPRESSION VALIDATION                 validator.mjs
 │       validateCompression(text, finalText)
 │       .valid === false → return undefined (fall back to original)
 │
 ├─ [10] STATS + NOTE + VERBOSE LOG                 token-estimate.mjs
 │        estimateTokens(charCount, modelFamily)
 │        stats update, LLM note append, optional session.log
 │
 └─ return { modifiedPrompt: finalText + note }
```

### 3.2 Pass-through conditions (return `undefined`, no modification)

| Condition | Step |
|-----------|------|
| `!compressEnabled` | 0 |
| `text.trim() === ''` | 0 |
| Prompt is a data format document | 1 |
| Safety gate fails | 4 |
| Post-compression validation fails | 9 |
| Any uncaught exception | outer try/catch (unchanged) |

---

## 4. Intensity Level System

### 4.1 Enum and Feature Gate Matrix

Module: `src/intensity.mjs`

```js
export const INTENSITIES = ['none', 'minimal', 'aggressive'];

export function gateEnabled(feature, intensity) → boolean
```

| Feature              | none | minimal | aggressive |
|----------------------|------|---------|------------|
| `filler_basic`       | ✗    | ✓       | ✓          |
| `filler_deep`        | ✗    | ✗       | ✓          |
| `comment_strip`      | ✗    | ✗       | ✓          |
| `structure_collapse` | ✗    | ✗       | ✓          |
| `safety_gate`        | ✗    | basic   | full       |
| `domain_mode`        | ✗    | ✓       | ✓          |
| `data_format_bypass` | ✓    | ✓       | ✓          |
| `post_validate`      | ✗    | ✓       | ✓          |

- `none` — pipeline runs but no transforms fire. Equivalent to `compressEnabled = false`. Reserved for testing and future automation.
- `minimal` — **default** (preserves current behavior exactly when no new features configured). Basic fillers only, no code touching.
- `aggressive` — all transforms. Deeper fillers, comment stripping, structure collapse, full safety gate.

**Default intensity: `'minimal'`** — ensures zero behavioral change for existing users.

### 4.2 Impact on `compressText()`

`src/compress.mjs` receives `intensity` as a third parameter:

```js
export function compressText(text, lang = 'en', intensity = 'minimal') → string
```

At `minimal`: current behavior unchanged — `ENGLISH_FILLERS` regex only (EN), IT three-pass only (IT).

At `aggressive`: additional passes after the existing logic:

**EN additions (aggressive only):**
- Hedging: `\b(I think|I guess|I suppose|probably|perhaps|maybe|sort of|kind of|somewhat|rather)\b`
- Pleasantries: `\b(Sure!?|Happy to help|Absolutely|Certainly|Of course|Great question)\b` (case-insensitive, with optional punctuation)
- Connectives: `\b(however|therefore|furthermore|moreover|nevertheless|consequently|in order to|as a result|due to the fact that)\b`

**IT additions (aggressive only):**
- Hedging: `\b(penso che|credo che|forse|probabilmente|quasi|in un certo senso)\b`
- Pleasantries: `\b(certo|certamente|assolutamente|con piacere)\b`

These are additional regex passes appended to the existing function body, guarded by `if (intensity === 'aggressive')`.

---

## 5. Language-Aware Code Comment Stripping

Module: `src/comment-strip.mjs`

**Triggered at:** pipeline step 3, intensity === `'aggressive'` only.

**Input:** raw fenced block content + language tag extracted from ` ```lang ` header.

```js
export function stripComments(code, lang) → string
// lang: normalized to lowercase by caller
```

### 5.1 Language → Strip Rules

| `lang` tag(s) | Single-line pattern | Block pattern | Preserve |
|--------------|---------------------|---------------|---------|
| `js`, `javascript`, `ts`, `typescript` | `//[^\n]*` | `/\*[\s\S]*?\*/` | JSDoc (`/**`) |
| `python`, `py` | `#[^\n]*` | `"""[\s\S]*?"""` (triple-quoted) | Module docstrings (first statement) |
| `rust`, `rs` | `//[^\n]*` | `/\*[\s\S]*?\*/` | Doc comments (`///`, `//!`) |
| `go` | `//[^\n]*` | `/\*[\s\S]*?\*/` | None special |
| `sh`, `bash`, `shell`, `zsh` | `#[^\n]*` | — | Shebang (`#!` on line 1) |

Languages NOT in this list: comments preserved verbatim (no-op).

### 5.2 Code Block Language Tag Extraction

`src/code-blocks.mjs` must be modified to expose the language tag per slot.

Current `FENCED_RE`: `` /```[\w-]*\r?\n[\s\S]*?```/g ``

The language tag is the `[\w-]*` capture. The modified `extractCodeBlocks` return shape:

```js
// BEFORE (current)
slots: Map<string, string>          // key → raw block string

// AFTER
slots: Map<string, { raw: string, lang: string | null }>
```

Where `lang` is the lowercase language tag parsed from the opening fence line, or `null` if no tag was present.

`restoreCodeBlocks` reads `slot.raw` for substitution. API change is internal to the two functions — `extension.mjs` passes `slots` as opaque object between extract and restore.

### 5.3 Code Structure Collapse (aggressive only)

Brace-depth tracking collapses function/class bodies exceeding a configurable depth threshold. This is a sub-feature of `comment-strip.mjs` (same module — both are code-content transforms).

```js
export function collapseStructure(code, lang, maxDepth = 2) → string
// Replaces bodies deeper than maxDepth with: // ... N lines
// Only applicable to brace-delimited langs: js/ts/java/go/rust/c
```

Called from pipeline step 3 after `stripComments`. If `lang` does not use braces (Python, Shell), this is a no-op.

---

## 6. Data Format Safety Layer

Module: `src/data-format.mjs`

**Triggered at:** pipeline step 1, ALL intensities.

```js
export function detectDataFormat(text) → 'json' | 'yaml' | 'toml' | 'csv' | 'xml' | null

export function isSafeToCompress(text) → boolean
// returns false iff detectDataFormat(text) !== null
```

### 6.1 Detection Heuristics (applied in order)

```
1. JSON:  trimmed text starts with { or [
          AND contains at least one : or ,
          Short-circuit: no regex needed beyond /^\s*[{[]/.test(text)

2. XML:   trimmed text starts with < or <?xml
          Pattern: /^\s*<[?!]?[a-zA-Z]/.test(text)

3. YAML:  contains --- on a line by itself, OR
          3+ lines matching /^[\w-]+:\s/.test(line)

4. TOML:  contains [section] header pattern on a line by itself, AND
          at least one key = value line

5. CSV:   4+ lines, each line has same number of commas (>= 1),
          no line is blank
```

**Scope:** bypass fires only if the ENTIRE prompt is a data format document. A prompt that contains a JSON snippet embedded in prose prose is NOT bypassed — the snippet is already protected by code block extraction (step 2). The bypass targets raw data payloads that users accidentally send without fencing.

---

## 7. Tool Output Compression

Module: `src/tool-compress.mjs`

### 7.1 Hook Design in `extension.mjs`

New hook in the `joinSession()` call (conditional on SDK support — see Open Questions §12.1):

```js
hooks: {
  onUserPromptSubmitted: ...,       // UNCHANGED

  onToolResult: async (toolResult) => {
    if (!compressEnabled || !toolCompressEnabled) return undefined;
    try {
      const compressed = compressToolOutput(
        toolResult.toolName ?? toolResult.tool ?? '',
        toolResult.output  ?? toolResult.content ?? '',
        intensity,
      );
      return { modifiedOutput: compressed };
    } catch {
      return undefined;    // never crash the hook
    }
  },
}
```

`toolCompressEnabled` is a separate boolean (default `false`). Tool compression is opt-in, independent of prompt compression.

### 7.2 `tool-compress.mjs` API

```js
export function compressToolOutput(toolName, output, intensity) → string
```

### 7.3 Strategies by Tool Name

| `toolName` | Strategy | Limit |
|------------|----------|-------|
| `grep` | Deduplicate adjacent identical match lines; keep top N matches | 50 matches |
| `view` | If > 200 lines: keep first 50 + `…[N lines omitted]…` + last 20 | 200 lines |
| `bash`, `run`, `shell` | If > 100 lines: keep first 30 + `…[N lines omitted]…` + last 10 | 100 lines |
| `*` (default) | If > 500 chars: keep first 300 + `…[truncated N chars]…` | 500 chars |

At `minimal` intensity: only default strategy applies.
At `aggressive` intensity: tool-specific strategies apply.

### 7.4 Tool Schema De-duplication

**Per RTK finding:** tool catalog should be loaded once per session in instructions, not repeated per turn.

This is a Copilot SDK concern, not a `tool-compress.mjs` concern. If the SDK passes tool schemas into tool result payloads, `compressToolOutput` should strip the schema body when `toolName` matches a previously-seen tool.

```js
// In extension.mjs, tracked at session scope:
const seenToolSchemas = new Set();
// In onToolResult: if toolResult.schema && seenToolSchemas.has(toolName) → strip schema
```

Implementation detail: the exact field name for schema in the tool result payload is unknown until the hook is verified (see §12.1).

---

## 8. Domain Modes

Module: `src/domain.mjs`

**Triggered at:** pipeline step 6, when `domainMode !== null`.

```js
export function applyDomainTransforms(text, mode) → string
// mode: 'commit' | 'review'
```

### 8.1 `commit` Mode

Target: user prompts asking for commit message generation.

Transforms applied (ordered):
1. Strip preamble: `/^(sure|happy to|glad to|of course|certainly|absolutely)[^.!?\n]*[.!?\n]/i`
2. Strip request verbs: `\b(can you|could you|please|would you|write me|generate)\b`
3. Normalize to imperative fragment: strip trailing politeness (`\s*(thanks|thank you)[.!]?\s*$/i`)

**Does not modify:** commit diff content, file paths, code fragments.

### 8.2 `review` Mode

Target: user prompts for code review or feedback.

Transforms applied (ordered):
1. Strip softening hedges: `\b(I think|I guess|I believe|I feel like|maybe|perhaps|sort of|kind of|possibly|somewhat|rather|quite)\b`
2. Strip pleasantries: `\b(thanks|thank you|please|appreciate it)\b` at sentence boundaries
3. Strip preamble openers: `/^(Hey|Hi|Hello)[,\s]+/i`

**Does not modify:** line/function references (L:N format), code snippets, file paths.

### 8.3 Commands for Domain Mode

```
/compress mode commit   → domainMode = 'commit'
/compress mode review   → domainMode = 'review'
/compress mode off      → domainMode = null
```

Domain mode is orthogonal to intensity. Active at `minimal` and `aggressive`.

---

## 9. Post-Compression Validator

Module: `src/validator.mjs`

**Triggered at:** pipeline step 9, intensities `minimal` and `aggressive`.

```js
export function validateCompression(original, compressed) → { valid: boolean, violations: string[] }
```

### 9.1 Invariants Checked

| Check | Method | On failure |
|-------|--------|------------|
| Heading count | `(text.match(/^#{1,6}\s/gm) ?? []).length` equal before/after | `valid = false` |
| URL count | `(text.match(/https?:\/\/\S+/g) ?? []).length` equal before/after | `valid = false` |
| Inline code count | count of `` `[^`\r\n]+` `` matches (non-fenced) | `valid = false` |
| Compression floor | `compressed.length / original.length >= 0.10` | `valid = false` (90%+ reduction indicates a bug) |
| No orphaned punctuation | compressed does not end with `,` or `;` after trim | `valid = false` |

**On `valid === false`:** pipeline step 9 returns `undefined` (original prompt passes through unchanged). The validator never throws.

**Design note:** heading and URL checks fail if `compressText` accidentally strips a `##` or `http` fragment. The floor check catches runaway regex. The orphaned-punctuation check catches incomplete sentence stripping at aggressive intensity.

---

## 10. Session State Changes

### 10.1 New State Variables (`extension.mjs`)

```js
// Existing (unchanged):
let compressEnabled = false;
let verboseMode     = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0 };

// New:
let intensity           = 'minimal';   // 'none' | 'minimal' | 'aggressive'
let domainMode          = null;         // null | 'commit' | 'review'
let modelFamily         = 'gpt4';       // 'gpt4' | 'claude' | 'gemini'
let toolCompressEnabled = false;        // onToolResult compression opt-in
const seenToolSchemas   = new Set();    // tool schema de-dup
```

All state initialises at module load (i.e. `joinSession()` invocation). All resets on `/clear` (extension reload), same as current behavior.

### 10.2 Updated `status` Output

```
/compress status now reports:

Compression: ON · Verbose: ON · Intensity: aggressive · Domain: commit · Model: gpt4
Session: 14 msgs · 18,432 → 7,103 chars (-61%) · ~2,832 tokens saved
```

Token estimation uses `estimateTokens(charCount, modelFamily)` from `src/token-estimate.mjs` instead of the hardcoded `/ 4`.

### 10.3 Updated `handleCompressCommand` Dispatch Table

| `context.args` | Mutation | Response |
|----------------|----------|----------|
| `on` | `compressEnabled = true` | `"Compression ON (intensity: minimal)"` |
| `off` | `compressEnabled = false` | `"Compression OFF"` |
| `verbose` | `verboseMode = !verboseMode` | toggle message |
| `status` / `""` | none | expanded stats (§10.2) |
| `intensity minimal` | `intensity = 'minimal'` | `"Intensity: minimal"` |
| `intensity aggressive` | `intensity = 'aggressive'` | `"Intensity: aggressive"` |
| `mode commit` | `domainMode = 'commit'` | `"Domain mode: commit"` |
| `mode review` | `domainMode = 'review'` | `"Domain mode: review"` |
| `mode off` | `domainMode = null` | `"Domain mode: off"` |
| `model gpt4` | `modelFamily = 'gpt4'` | `"Model: gpt4"` |
| `model claude` | `modelFamily = 'claude'` | `"Model: claude"` |
| `model gemini` | `modelFamily = 'gemini'` | `"Model: gemini"` |
| `tools` | `toolCompressEnabled = !toolCompressEnabled` | toggle message |
| anything else | none | updated usage string |

---

## 11. Build Impact

### 11.1 `rollup.config.js` — **no changes required**

Entry point remains `extension.mjs`. All new `src/*.mjs` files are imported via relative paths from `extension.mjs` — rollup inlines them automatically. `@github/copilot-sdk/extension` remains external. The single-file `dist/extension.mjs` bundle continues to work.

### 11.2 New External Dependencies — **none**

All new modules are pure algorithmic. No npm packages added. `@github/copilot-sdk` remains the only declared dependency.

### 11.3 `package.json` test script — **update required**

Current (`package.json:9`):
```
"test": "node --test src/compress.test.mjs src/code-blocks.test.mjs src/lang-detect.test.mjs"
```

After upgrade (explicit list, compatible with Windows PowerShell):
```
"test": "node --test src/compress.test.mjs src/code-blocks.test.mjs src/lang-detect.test.mjs src/intensity.test.mjs src/comment-strip.test.mjs src/data-format.test.mjs src/safety.test.mjs src/validator.test.mjs src/tool-compress.test.mjs src/domain.test.mjs src/token-estimate.test.mjs"
```

Note: glob `src/*.test.mjs` is NOT used because PowerShell does not expand glob arguments to Node.js. Explicit list is the safe cross-platform approach (matches current pattern).

---

## 12. Backward Compatibility Contract

### 12.1 What is preserved exactly

| Behavior | Preserved? | Evidence |
|----------|-----------|---------|
| `/compress on` activates compression | ✓ | `handleCompressCommand` dispatch table unchanged |
| `/compress off` deactivates | ✓ | same |
| `/compress verbose` toggles verbose | ✓ | same |
| `/compress status` shows stats | ✓ | extended, not replaced |
| `intensity = 'minimal'` produces current output | ✓ | `compressText` minimal path = current body verbatim |
| Code blocks extracted before, restored after | ✓ | `code-blocks.mjs` API preserved; `slots` shape change is internal |
| LLM note format | ✓ | `extension.mjs:85` note string unchanged |
| No crash on exception | ✓ | outer try/catch preserved |
| Token estimate formula at minimal | ✓ | `estimateTokens(chars, 'gpt4')` returns `Math.round(chars / 4)` |

### 12.2 Behavioral changes that are additive only

- New commands (`intensity`, `mode`, `model`, `tools`) added to dispatch. Unknown args still returns "Unknown subcommand" + updated usage string.
- Data format bypass: NEW behavior — a prompt that is entirely JSON/YAML now passes through unchanged. Previously it would have been (uselessly) compressed. This is correct behavior, not a regression.
- Safety gate at `minimal`: blocks only if `text.split(/\s+/).length < 5` (too-short prompts). Previously these would compress to near-empty strings — pass-through is strictly better.

### 12.3 Slots shape change (`code-blocks.mjs`)

Current: `Map<string, string>`
New: `Map<string, { raw: string, lang: string | null }>`

This change is internal to `extension.mjs`, which is the only caller of `extractCodeBlocks` and `restoreCodeBlocks`. No external consumers. The test file (`src/code-blocks.test.mjs`) must be updated to reflect the new slot shape — all existing assertions on `slots.size` and `stripped` content remain valid; assertions that directly access slot values need `.raw` accessor.

---

## 13. Per-Model Token Estimation

Module: `src/token-estimate.mjs`

```js
export const MODEL_DIVISORS = {
  gpt4:   4.0,
  claude: 3.5,
  gemini: 4.0,
};

export function estimateTokens(charCount, modelFamily = 'gpt4') → number
// returns Math.round(charCount / (MODEL_DIVISORS[modelFamily] ?? 4.0))
```

Replaces the hardcoded `/ 4` at `extension.mjs:89` and `:42`.

Default `modelFamily = 'gpt4'` → `divisor = 4.0` → identical numeric output to current code. Zero behavior change at default settings.

---

## 14. Test Coverage Requirements

Each new module ships a `.test.mjs`. Minimum cases per module:

| Module | Minimum test cases |
|--------|--------------------|
| `intensity.mjs` | gateEnabled returns correct values for all feature × intensity combinations |
| `comment-strip.mjs` | strips JS `//`, strips JS `/* */`, preserves JSDoc, strips Python `#`, preserves shebang, no-op for unknown lang |
| `data-format.mjs` | detects JSON object, JSON array, YAML, TOML, CSV, XML; does NOT flag plain prose; does NOT flag fenced code block prose |
| `safety.mjs` | blocks < 5 words (minimal), passes normal prose (minimal), blocks high proper noun ratio (aggressive), passes mixed text (aggressive) |
| `validator.mjs` | passes identical text, flags heading loss, flags URL loss, flags inline code loss, flags > 90% reduction, flags orphaned comma |
| `tool-compress.mjs` | grep truncation, view truncation, bash truncation, default truncation, no-op on short output |
| `domain.mjs` | commit strips preamble, commit preserves diff content, review strips hedging, review preserves L:N refs |
| `token-estimate.mjs` | gpt4 divisor, claude divisor, gemini divisor, unknown model falls back to gpt4 |

Existing tests (`compress.test.mjs`, `code-blocks.test.mjs`, `lang-detect.test.mjs`) must continue passing without modification, except `code-blocks.test.mjs` assertions that directly access slot values (update to `.raw`).

---

## 15. Open Questions

These must be resolved before implementation begins. They are not design choices — they are unknowns that can block specific features.

**15.1 `onToolResult` hook existence** ⚠️ BLOCKS §7

Does `@github/copilot-sdk/extension` expose an `onToolResult` hook in its `joinSession()` hooks object? The existing `architecture.md` confirms only `onUserPromptSubmitted`. If `onToolResult` does not exist in the SDK, `tool-compress.mjs` and the `toolCompressEnabled` state variable must be deferred entirely. Check SDK source or changelog before implementing.

**15.2 `toolResult` payload field names** ⚠️ BLOCKS §7.1, §7.4

If `onToolResult` does exist: what are the field names for tool name, output content, and tool schema in the hook's argument object? The implementation at `extension.mjs` (§7.1) uses `toolResult.toolName ?? toolResult.tool ?? ''` as a defensive guess. Exact field names must be verified against SDK types before shipping.

**15.3 Intensity default** — DECISION NEEDED

Default is proposed as `'minimal'` to preserve current behavior. Confirm with Gio. If `'aggressive'` is preferred as the "on" default, the `intensity` initialization changes from `'minimal'` to `'aggressive'` at `extension.mjs` scope. This is a one-line change but must be a deliberate decision.

**15.4 JSDoc and Rust doc-comment preservation** — DECISION NEEDED

`comment-strip.mjs` (§5.1) currently preserves JSDoc (`/**`) and Rust `///` / `//!` doc comments. This may leave significant comment volume in code slots. If Gio wants doc comments stripped at `aggressive`, the preservation exceptions are removed. Default design: preserve doc comments (safer).

**15.5 `code-blocks.test.mjs` slot shape migration** — SCOPE CONFIRMATION

The slot shape change (`Map<string, string>` → `Map<string, { raw, lang }>`) requires updating `code-blocks.test.mjs`. Confirm this is in scope for the implementation sprint. If the change creates test failures before `comment-strip.mjs` is ready, the slots migration can be gated behind an internal flag or done as Phase 1 of implementation.

**15.6 Data format bypass scope** — DECISION NEEDED

Current design: bypass fires only when the ENTIRE prompt is a data format document. A prompt like "Here is my config, please review:\n```yaml\nfoo: bar\n```" is NOT bypassed (the YAML is already protected by code block extraction). Confirm this interpretation is correct. Alternative: bypass if > 50% of the prompt is a data format structure — more aggressive but complex.

**15.7 `package.json` test script — Windows glob**

The current script lists test files explicitly (compatible with Windows PowerShell). After adding 8 new test files, the explicit list becomes unwieldy. Confirm whether the project runs tests in a Unix shell (Git Bash, WSL) where `src/*.test.mjs` glob would work, or stays on PowerShell where it does not.

---

## Appendix A: Module Signatures Summary

```js
// src/intensity.mjs
export const INTENSITIES = ['none', 'minimal', 'aggressive'];
export function gateEnabled(feature, intensity) → boolean

// src/comment-strip.mjs
export function stripComments(code, lang) → string
export function collapseStructure(code, lang, maxDepth = 2) → string

// src/data-format.mjs
export function detectDataFormat(text) → 'json'|'yaml'|'toml'|'csv'|'xml'|null
export function isSafeToCompress(text) → boolean

// src/safety.mjs
export function checkSafety(text, intensity) → { safe: boolean, reason: string|null }

// src/validator.mjs
export function validateCompression(original, compressed) → { valid: boolean, violations: string[] }

// src/tool-compress.mjs
export function compressToolOutput(toolName, output, intensity) → string

// src/domain.mjs
export function applyDomainTransforms(text, mode) → string
// mode: 'commit' | 'review'

// src/token-estimate.mjs
export const MODEL_DIVISORS = { gpt4: 4.0, claude: 3.5, gemini: 4.0 }
export function estimateTokens(charCount, modelFamily?) → number

// src/code-blocks.mjs  (MODIFIED — slot shape only)
export function extractCodeBlocks(text) → { stripped: string, slots: Map<string, { raw: string, lang: string|null }> }
export function restoreCodeBlocks(stripped, slots) → string

// src/compress.mjs  (MODIFIED — new intensity param)
export function compressText(text, lang?, intensity?) → string
```

---

## Appendix B: Phased Implementation Order

The modules have no cross-dependencies in `src/`. Phases are sequenced by risk, not by technical dependency. Each phase is independently shippable and passes CI.

**Phase 1 — Foundation (lowest risk, no behavior change)**
- `src/token-estimate.mjs` + test
- `src/intensity.mjs` + test
- Update `extension.mjs`: add `intensity`, `modelFamily` state + commands; replace hardcoded `/ 4` with `estimateTokens()`
- Update `package.json` test script

**Phase 2 — Safety net (needed before aggressive mode is safe to ship)**
- `src/data-format.mjs` + test
- `src/safety.mjs` + test
- `src/validator.mjs` + test
- Wire steps 1, 4, 9 into `extension.mjs` pipeline

**Phase 3 — Code transforms (requires Phase 1+2 complete)**
- Modify `src/code-blocks.mjs`: expose `lang` in slot shape
- Update `src/code-blocks.test.mjs`: `.raw` accessor
- `src/comment-strip.mjs` + test (includes `collapseStructure`)
- Wire step 3 into pipeline

**Phase 4 — Deeper filler + domain (requires Phase 2 complete)**
- Modify `src/compress.mjs`: add `intensity` param + aggressive filler passes
- `src/domain.mjs` + test
- Wire steps 6, 7 into pipeline; add `domainMode` state + commands

**Phase 5 — Tool output (conditional on §15.1 resolution)**
- `src/tool-compress.mjs` + test
- Add `onToolResult` hook to `extension.mjs`
- Add `toolCompressEnabled` state + `tools` command
- Add `seenToolSchemas` de-dup logic

Each phase: `npm run build` must succeed, `npm test` must pass, `dist/extension.mjs` must be re-committed.
