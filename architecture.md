# Architecture: `copilot-compress`

**Date:** 2026-06-05  
**Status:** Proposed  
**Author:** Hugo (Senior Software Architect)

---

## 1. Overview

`copilot-compress` is a standalone Copilot CLI extension that intercepts user messages
before they reach the LLM and algorithmically compresses them — stripping filler words,
articles, pronouns, and discourse markers — to reduce token consumption without losing
semantic intent.

It operates as a session-scoped toggle. Off by default. When active, every user message
is preprocessed: code blocks are extracted and preserved verbatim, the prose remainder
is passed through `compressText()`, and the compressed version replaces the original
prompt. A brief note is appended for the LLM's awareness.

Supports EN and IT. Verbose mode reports character and estimated token savings after
each compressed message. Zero LLM calls — pure algorithmic.

---

## 2. Constraints

### Why the plugin system is insufficient

Luka's research (verified 2026-06-05) establishes two hard blockers:

1. **`hooks.json` `userPromptSubmitted` is read-only.** The hook fires but its return
   value is not processed by Copilot CLI. There is no mechanism to replace or modify
   the prompt through this channel.

2. **Plugin system has no `extensions` field.** `plugin.json` cannot bundle or reference
   an `extension.mjs`. Plugin hooks are stateless shell subprocesses — they carry no
   session state and cannot return structured data back to the CLI pipeline.

**Conclusion:** the plugin system cannot intercept and modify prompts. Period.

### The only viable mechanism

`extension.mjs` via `@github/copilot-sdk/extension`, using `joinSession()`:

```js
const session = await joinSession({
  hooks: {
    onUserPromptSubmitted: async (input) => {
      // return { modifiedPrompt } to replace the prompt
      // return undefined to pass through unchanged
    }
  }
});
```

`UserPromptSubmittedHookOutput` supports:
- `modifiedPrompt: string` — replaces `input.prompt` in full
- `additionalContext: string` — appended to session context
- `suppressOutput: boolean` — suppresses the assistant response

This extension uses `modifiedPrompt` exclusively. `additionalContext` is not used
(the LLM note is embedded in the modified prompt itself).

---

## 3. Repository Structure

```
copilot-compress/
├── extension.mjs          ← Entry point. joinSession(), module-level state,
│                            command dispatch, hook wiring.
├── src/
│   ├── compress.mjs       ← compressText(text, lang) — copied verbatim from
│   │                        project-olly/tools/cli/commands/session.mjs:921–1014.
│   │                        Pure function, no I/O, no deps.
│   ├── code-blocks.mjs    ← extract(text) → { stripped, placeholders }
│   │                        restore(stripped, placeholders) → original structure
│   │                        Preserves fenced code blocks and inline code verbatim.
│   └── lang-detect.mjs    ← detectLang(text) → 'en' | 'it'
│                            Heuristic: Italian diacritics + word frequency probe.
│                            Returns 'en' on tie or ambiguity.
├── package.json           ← type: "module", single dep: @github/copilot-sdk
└── README.md              ← Install instructions + command reference
```

**Invariant:** `src/` modules have zero external dependencies. `extension.mjs` is the
only file that imports from `@github/copilot-sdk/extension`. All `src/` imports are
relative.

---

## 4. Module Design

### `extension.mjs`

**Responsibility:** session wiring, state management, command dispatch, hook handler.

**Imports:**
- `@github/copilot-sdk/extension` → `joinSession`
- `./src/compress.mjs` → `compressText`
- `./src/code-blocks.mjs` → `extract`, `restore`
- `./src/lang-detect.mjs` → `detectLang`

**Module-level state** (persists for session lifetime, reset on `/clear`):
```js
let compressEnabled = false;
let verboseMode     = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0 };
```

**Exports:** none (extension entry point, not a library).

---

### `src/compress.mjs`

**Responsibility:** algorithmic text compression. Copied verbatim from
`project-olly/tools/cli/commands/session.mjs:921–1014`.

**Exports:**
```js
export function compressText(text, lang = 'en') → string
```

**Dependencies:** none.

**Do not modify.** If the source algorithm is updated, copy the new version wholesale.
No divergence between the two codebases.

---

### `src/code-blocks.mjs`

**Responsibility:** extract code regions before compression, restore them after.

**Exports:**
```js
export function extractCodeBlocks(text) → { stripped: string, slots: Map<string, string> }
export function restoreCodeBlocks(stripped, slots) → string
```

**Algorithm** (see §8 for detail):
1. Find fenced blocks (`` ``` ... ``` ``) and inline code (`` `...` ``).
2. Replace each with a unique placeholder: `__CODE_0__`, `__CODE_1__`, etc.
3. `stripped` is the placeholder-substituted text.
4. `slots` maps placeholder → original code string.
5. `restore` does a simple string replace of each placeholder with its original.

**Dependencies:** none. Pure regex + string operations.

---

### `src/lang-detect.mjs`

**Responsibility:** heuristic language detection for per-message auto-detection.

**Exports:**
```js
export function detectLang(text) → 'en' | 'it'
```

**Algorithm** (see §9 for detail).

**Dependencies:** none.

---

## 5. Data Flow

### `/compress <subcommand>` received

The CLI routes slash commands to their registered handler before `onUserPromptSubmitted`
fires. `/compress on`, `/compress off`, etc. never reach the hook.

```
handleCompressCommand(context)
  │
  └─ dispatch(context.args.trim().toLowerCase())
       → mutate state
       → session.log(response)
```

### Message received, compression OFF

```
onUserPromptSubmitted(input)
  │
  └─ return undefined   (pass through unchanged)
```

### Message received, compression ON

```
onUserPromptSubmitted(input)
  │
  └─ compress pipeline:
       1. extractCodeBlocks(input.prompt)
          → { stripped, slots }

       2. detectLang(stripped)         ← runs on prose only, not on code
          → 'en' | 'it'

       3. compressText(stripped, lang)
          → compressedStripped

       4. restoreCodeBlocks(compressedStripped, slots)
          → finalText

       5. Append LLM note:
          finalText += '\n\n[compressed: ' + originalLen + '→' + compressedLen + ' chars]'

       6. Update stats (if verbose):
          stats.originalChars   += originalLen
          stats.compressedChars += compressedLen
          stats.messageCount    += 1

       7. If verboseMode:
          session.log(statsLine, { ephemeral: true })

       8. return { modifiedPrompt: finalText }
```

**Pass-through conditions** (return `undefined`, no modification):
- `compressEnabled === false`
- `input.prompt.trim()` is empty

---

## 6. State Model

| Variable | Type | Default | Reset trigger |
|---|---|---|---|
| `compressEnabled` | `boolean` | `false` | `/clear` (extension reload) |
| `verboseMode` | `boolean` | `false` | `/clear` |
| `stats.originalChars` | `number` | `0` | `/clear` |
| `stats.compressedChars` | `number` | `0` | `/clear` |
| `stats.messageCount` | `number` | `0` | `/clear` |

**Lifecycle:**

```
Module load (joinSession)
  → all state variables initialized to defaults
  → hook registered

/compress on
  → compressEnabled = true

User message arrives
  → if compressEnabled: run pipeline, update stats

/compress off
  → compressEnabled = false
  → stats not reset (historical data preserved until /clear)

/compress verbose
  → verboseMode = !verboseMode   (toggle)

/clear (Copilot CLI reloads extension)
  → module re-executes from top → all state back to defaults
```

There is no `onSessionEnd` hook. State loss on `/clear` is by design — documented
behavior of the extension model.

---

## 7. Command Handling

Slash commands are registered via the **`commands` array** in `joinSession()`. This is
the correct mechanism — verified against `copilot-ledger/extension/extension.mjs:285–291`.

The CLI routes `/compress <args>` to `handleCompressCommand` before `onUserPromptSubmitted`
fires. By the time the hook runs, the CLI has already consumed the slash command. The hook
must not attempt to detect or handle commands.

**`joinSession()` wiring:**

```js
session = await joinSession({
  commands: [
    {
      name: "compress",
      description: "Toggle algorithmic prompt compression. Subcommands: on, off, verbose, status.",
      handler: handleCompressCommand,
    },
  ],
  hooks: {
    onUserPromptSubmitted: async (input) => {
      // compression pipeline only — NO command detection here
    },
  },
});
```

**Handler (`handleCompressCommand`):**

```js
async function handleCompressCommand(context) {
  const sub = (context.args ?? '').trim().toLowerCase();

  if (sub === 'on') {
    compressEnabled = true;
    await session.log('Compression **ON** (lang: auto-detect, EN/IT)');
    return;
  }
  if (sub === 'off') {
    compressEnabled = false;
    await session.log('Compression **OFF**');
    return;
  }
  if (sub === 'verbose') {
    verboseMode = !verboseMode;
    await session.log(`Verbose ${verboseMode ? '**ON**' : '**OFF**'}`);
    return;
  }
  if (sub === 'status' || sub === '') {
    // build and log status string (see dispatch table below)
    await session.log(buildStatusLine());
    return;
  }
  await session.log('Unknown subcommand. Usage: `/compress on|off|verbose|status`');
}
```

**Dispatch table:**

| `context.args` | State mutation | `session.log` output |
|---|---|---|
| `"on"` | `compressEnabled = true` | `"Compression ON (lang: auto-detect, EN/IT)"` |
| `"off"` | `compressEnabled = false` | `"Compression OFF"` |
| `"verbose"` | `verboseMode = !verboseMode` | `"Verbose ON"` / `"Verbose OFF"` |
| `"status"` or `""` | none | stats summary (see §10) |
| anything else | none | `"Unknown subcommand. Usage: /compress on\|off\|verbose\|status"` |

**Forward-reference pattern** (from `copilot-ledger/extension/extension.mjs:235`):

`handleCompressCommand` calls `session.log()`, but `session` is assigned by
`joinSession()` which runs after the handler is defined. Declare `let session` at module
scope and assign on the `joinSession` return value — same forward-reference pattern used
by copilot-ledger.

---

## 8. Code Block Detection

Code blocks are extracted **before** compression and restored **after**. This ensures
that code content — which contains identifiers, keywords, and syntax that must not be
stripped — is never touched by `compressText()`.

### Fenced blocks

Pattern: `` ```[lang]\n...content...\n``` ``

```
/```[\w]*\n[\s\S]*?```/g
```

Handles multi-line content. The language tag (e.g., `python`, `js`) is preserved.

### Inline code

Pattern: `` `single-line content` ``

```
/`[^`\n]+`/g
```

Single-line only. Backtick-escaped content in the middle of prose.

### Extraction order

Fenced blocks are extracted first (they may contain backticks internally). Inline code
is extracted second, on the already-fenced-stripped text. This avoids double-processing.

### Placeholder format

`__CODEBLOCK_N__` where N is a zero-based integer. Format chosen to:
- Survive `compressText()` without being mangled (no articles, no fillers match `__CODEBLOCK_N__`)
- Be visually obvious in debug output
- Avoid collision with typical prose (double-underscore prefix)

### Attachment exclusion (Req #3)

`input.prompt` contains only the user's typed message. True file attachments (code
files opened via Copilot CLI's file picker) are injected by the CLI host outside the
`prompt` field — they appear in context but are not passed through `onUserPromptSubmitted`
as part of `input.prompt`. Therefore, attached code files are excluded from compression
automatically — no special handling required.

**Assumption**: this is based on Luka's description of the SDK. If the SDK passes
attached file content inline in `input.prompt`, this assumption is wrong and Req #3
cannot be satisfied without SDK introspection. Flag as open question (see §12 of
`implementation-plan.md`).

---

## 9. Language Detection

**Design decision: auto-detect per message, not a session toggle.**

Rationale: Gio switches between EN and IT mid-session. A session-level `/compress lang it`
toggle would require manual switching and would break on mixed-language sessions. Auto-
detection per message is simpler from the user's perspective and covers the real use case.

**Algorithm (`src/lang-detect.mjs`):**

```
Score = (Italian indicator count) / (total word count)

Italian indicators:
  - Characters: à, è, é, ì, ò, ù, ñ  (weight: 2 per occurrence)
  - Words: common function words present in IT_SINGLE_WORDS
    (quindi, però, tuttavia, inoltre, dunque, ebbene, insomma, comunque, appunto)
    (weight: 1 per occurrence)

If Score >= 0.05 → 'it'
Else            → 'en'
```

Threshold 0.05 (5%) is conservative — avoids false-positives on EN text that happens
to contain Italian loanwords. Tie goes to `'en'`.

**Detection is applied to `stripped` text** (after code block extraction), so code
identifiers with Italian-looking characters don't pollute the score.

**Testable:** `detectLang` is a pure function. The threshold is a named constant
(`const IT_THRESHOLD = 0.05`) at the top of `lang-detect.mjs` — easy to tune.

---

## 10. Token Estimation

Verbose mode reports character reduction and an estimated token reduction.

**Heuristic:** `1 token ≈ 4 characters` (confirmed by Gio, 2026-06-05).

```
originalTokensEst   = Math.round(originalChars  / 4)
compressedTokensEst = Math.round(compressedChars / 4)
savedTokensEst      = originalTokensEst - compressedTokensEst
reductionPct        = Math.round((1 - compressedChars / originalChars) * 100)
```

**Verbose output format (per message):**

```
[compress] 1,247 → 431 chars (-65%) · ~204 tokens saved
```

**Session summary (on `/compress status`):**

```
Session: 14 msgs · 18,432 → 7,103 chars (-61%) · ~2,832 tokens saved
```

Token counts are estimates only. No claim of exact token count — approximation is
sufficient for the use case (user awareness, not billing).

---

## 11. Cross-Platform Considerations

The extension runs inside the Copilot CLI Node.js process. No shell scripts, no
subprocesses, no native binaries. Platform concerns are minimal.

| Concern | Handling |
|---|---|
| File paths | Not needed — extension is self-contained, no file I/O |
| `process.execPath` | Not needed — no subprocess calls |
| Line endings | `compressText()` normalizes whitespace including `\r\n` via `\s{2,}` → `' '` |
| Module format | ESM throughout (`"type": "module"` in `package.json`) |
| Node.js version | 22+ (per workspace profile). No polyfills needed. |

No Windows-specific code paths required.

---

## 12. `package.json`

```json
{
  "name": "copilot-compress",
  "version": "1.0.0",
  "description": "Copilot CLI extension: algorithmic prompt compression",
  "type": "module",
  "main": "extension.mjs",
  "dependencies": {
    "@github/copilot-sdk": "*"
  },
  "engines": {
    "node": ">=22"
  }
}
```

**`@github/copilot-sdk` is the only dependency.** No compression libraries,
no language detection libraries, no tokenizer libraries. Everything is implemented
in-repo as pure functions.

**Version pin for `@github/copilot-sdk`:** leave as `"*"` initially. Pin to a specific
version once the SDK stabilizes or if a breaking change is observed. The SDK is a
peer runtime — Copilot CLI manages its own version; the extension should track it, not
pin against it.

---

## Architectural Invariants

1. `src/compress.mjs` is a verbatim copy of the upstream algorithm. Never modify it
   directly. Divergence from the source defeats the "battle-tested" guarantee.

2. `src/` modules have zero external imports. If a dependency is needed inside `src/`,
   it is a design error — refactor the dependency boundary.

3. `onUserPromptSubmitted` never throws. All errors are caught and result in
   `return undefined` (pass-through). A crashing extension blocks the user's prompt.

4. Command responses are output via `session.log()` inside `handleCompressCommand`.
   They are never returned as `modifiedPrompt`. The `modifiedPrompt` return value is
   reserved exclusively for compressed user messages.
