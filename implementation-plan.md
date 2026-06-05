# Implementation Plan: `copilot-compress`

**Date:** 2026-06-05  
**Author:** Hugo (Senior Software Architect)  
**Implementer:** Alex (Full-Stack Developer)  
**Architecture ref:** `architecture.md`

---

## Dependency Graph Between Phases

```
Phase 1 (scaffold + compress.mjs)
  └─► Phase 2 (code-blocks.mjs)
        └─► Phase 3 (lang-detect.mjs)
              └─► Phase 4 (extension.mjs core)
                    └─► Phase 5 (verbose + stats)
                          └─► Phase 6 (install + smoke test)
```

Each phase is independently testable. Do not start a phase until the previous passes
its acceptance criteria.

---

## Phase 1 — Scaffold + Compress Module

**Complexity:** S  
**Estimated time:** 1–2 hours

### Files to create

| File | Action |
|---|---|
| `package.json` | Create |
| `src/compress.mjs` | Copy from source |
| `src/compress.test.mjs` | Create |

### Steps

1. **Create `package.json`** with the exact content from `architecture.md §12`.

2. **Copy `src/compress.mjs`** from
   `D:\projects\project-olly\tools\cli\commands\session.mjs` lines 921–1014.
   - Copy the entire block: constants `ENGLISH_FILLERS`, `IT_PHRASES`,
     `IT_SINGLE_WORDS`, helper functions `buildItalianSinglePattern()`,
     `buildItalianContractedPattern()`, and the exported `compressText()`.
   - Add `export` to the function signature (it's already exported in source — verify).
   - Remove the `// ─── Compression helper ───` section comment if desired, but match
     the source exactly otherwise.
   - **Do not add any imports or dependencies.**

3. **Create `src/compress.test.mjs`** — Node.js built-in test runner:

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { compressText } from './compress.mjs';

describe('compressText EN', () => {
  it('removes articles', () => {
    const out = compressText('The quick brown fox jumps over the lazy dog');
    assert.ok(!out.includes(' the '), 'article "the" not removed');
  });
  it('removes "and"', () => {
    const out = compressText('create a branch and push it');
    assert.ok(!out.includes(' and '), '"and" not removed');
  });
  it('preserves numbers', () => {
    const out = compressText('there are 42 items in the list');
    assert.ok(out.includes('42'));
  });
  it('normalizes whitespace', () => {
    const out = compressText('hello   world');
    assert.equal(out, 'hello world');
  });
  it('handles empty string', () => {
    assert.equal(compressText(''), '');
  });
});

describe('compressText IT', () => {
  it('removes quindi', () => {
    const out = compressText('Quindi il sistema funziona bene', 'it');
    assert.ok(!out.includes('quindi'), '"quindi" not removed');
  });
  it('removes contracted preposition mid-sentence', () => {
    const out = compressText('Vado alla stazione domani', 'it');
    assert.ok(!out.includes(' alla '), '"alla" not removed');
  });
  it('preserves sentence-start contracted preposition', () => {
    // "Alla" at start of string: should be preserved (sentence boundary)
    const out = compressText('Alla fine del giorno', 'it');
    assert.ok(out.toLowerCase().startsWith('alla'), 'sentence-start "alla" was wrongly removed');
  });
});
```

### Acceptance criteria

```bash
node --test src/compress.test.mjs
```

All tests pass. Zero failures.

---

## Phase 2 — Code Block Extraction

**Complexity:** S  
**Estimated time:** 1–2 hours  
**Depends on:** Phase 1 complete

### Files to create

| File | Action |
|---|---|
| `src/code-blocks.mjs` | Create |
| `src/code-blocks.test.mjs` | Create |

### `src/code-blocks.mjs` — full implementation

```js
// Extract fenced and inline code blocks from text, replacing them with
// placeholders so the compression pass never touches code content.
// Placeholders survive compressText() unchanged (no filler words match __CODEBLOCK_N__).

const FENCED_RE  = /```[\w]*\n[\s\S]*?```/g;
const INLINE_RE  = /`[^`\n]+`/g;
const SLOT_PREFIX = '__CODEBLOCK_';

/**
 * @param {string} text
 * @returns {{ stripped: string, slots: Map<string, string> }}
 */
export function extractCodeBlocks(text) {
  const slots = new Map();
  let idx = 0;

  // Fenced first (they may contain backticks)
  let stripped = text.replace(FENCED_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    slots.set(key, match);
    return key;
  });

  // Inline second
  stripped = stripped.replace(INLINE_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    slots.set(key, match);
    return key;
  });

  return { stripped, slots };
}

/**
 * @param {string} text
 * @param {Map<string, string>} slots
 * @returns {string}
 */
export function restoreCodeBlocks(text, slots) {
  let out = text;
  for (const [key, original] of slots) {
    out = out.split(key).join(original);
  }
  return out;
}
```

### `src/code-blocks.test.mjs`

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { extractCodeBlocks, restoreCodeBlocks } from './code-blocks.mjs';
import { compressText } from './compress.mjs';

describe('extractCodeBlocks', () => {
  it('extracts fenced block', () => {
    const text = 'Fix the bug in:\n```js\nconst a = 1;\n```\nand push';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    assert.ok(!stripped.includes('const a'));
    assert.ok(stripped.includes('__CODEBLOCK_'));
  });

  it('extracts inline code', () => {
    const text = 'Call the `runCLI()` function please';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 1);
    assert.ok(!stripped.includes('runCLI'));
  });

  it('restores exactly', () => {
    const text = 'Use `npm install` to set up, then:\n```sh\nnpm run test\n```';
    const { stripped, slots } = extractCodeBlocks(text);
    const restored = restoreCodeBlocks(stripped, slots);
    assert.equal(restored, text);
  });

  it('code content is not compressed', () => {
    const text = 'Please run the following:\n```js\nconst the = "and";\n```';
    const { stripped, slots } = extractCodeBlocks(text);
    const compressed = compressText(stripped, 'en');
    const restored = restoreCodeBlocks(compressed, slots);
    assert.ok(restored.includes('const the = "and";'), 'code was incorrectly compressed');
  });

  it('no code blocks → identity', () => {
    const text = 'just some plain prose';
    const { stripped, slots } = extractCodeBlocks(text);
    assert.equal(slots.size, 0);
    assert.equal(stripped, text);
  });
});
```

### Acceptance criteria

```bash
node --test src/code-blocks.test.mjs
```

All tests pass. The "code content is not compressed" test is the critical one.

---

## Phase 3 — Language Detection

**Complexity:** S  
**Estimated time:** 1 hour  
**Depends on:** Phase 1 complete (for the Italian word list reference)

### Files to create

| File | Action |
|---|---|
| `src/lang-detect.mjs` | Create |
| `src/lang-detect.test.mjs` | Create |

### `src/lang-detect.mjs` — full implementation

```js
// Heuristic language detection: EN vs IT.
// Runs on prose text (code blocks already extracted).
// Returns 'it' if Italian indicator score >= IT_THRESHOLD; 'en' otherwise.
// Tie and ambiguity → 'en'.

const IT_THRESHOLD = 0.05; // 5% of words must be Italian indicators

// Italian diacritics pattern — each match scores 2
const IT_DIACRITIC_RE = /[àèéìòùñ]/gi;

// Italian discourse words — each match scores 1 (word boundary)
const IT_DISCOURSE_WORDS = [
  'quindi', 'allora', 'però', 'tuttavia', 'inoltre', 'pertanto',
  'dunque', 'ebbene', 'insomma', 'comunque', 'appunto',
];
const IT_DISCOURSE_RE = new RegExp(
  `(?<!\\w)(${IT_DISCOURSE_WORDS.join('|')})(?!\\w)`,
  'gi',
);

/**
 * @param {string} text - Prose text (code blocks already removed)
 * @returns {'en' | 'it'}
 */
export function detectLang(text) {
  if (!text || text.trim().length === 0) return 'en';

  const words = text.trim().split(/\s+/).length;
  if (words < 3) return 'en'; // too short to score reliably

  let score = 0;
  const diacritics = text.match(IT_DIACRITIC_RE);
  if (diacritics) score += diacritics.length * 2;

  const discourse = text.match(IT_DISCOURSE_RE);
  if (discourse) score += discourse.length;

  return (score / words) >= IT_THRESHOLD ? 'it' : 'en';
}
```

### `src/lang-detect.test.mjs`

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { detectLang } from './lang-detect.mjs';

describe('detectLang', () => {
  it('detects EN for English prose', () => {
    assert.equal(detectLang('Can you fix the build and run the tests again'), 'en');
  });
  it('detects IT for Italian prose with diacritics', () => {
    assert.equal(detectLang('Puoi correggere il codice però non toccare però il modulo già funzionante'), 'it');
  });
  it('detects IT from discourse words', () => {
    assert.equal(detectLang('Quindi dobbiamo rivedere inoltre la struttura dunque del sistema'), 'it');
  });
  it('returns EN for empty string', () => {
    assert.equal(detectLang(''), 'en');
  });
  it('returns EN for very short text', () => {
    assert.equal(detectLang('ciao'), 'en');
  });
  it('EN text with one Italian word stays EN', () => {
    // Single "però" in a long English sentence should not tip to IT
    assert.equal(detectLang('This is a long English sentence with però one Italian word'), 'en');
  });
});
```

### Acceptance criteria

```bash
node --test src/lang-detect.test.mjs
```

All tests pass. Note: the threshold test ("EN text with one Italian word") is the
regression guard for false-positive Italian detection.

---

## Phase 4 — Extension Core

**Complexity:** M  
**Estimated time:** 2–3 hours  
**Depends on:** Phases 1, 2, 3 complete and passing

### Files to create

| File | Action |
|---|---|
| `extension.mjs` | Create |

### Skeleton (Alex fills in the body)

```js
/**
 * copilot-compress — Copilot CLI extension
 * Algorithmically compresses user prompts to reduce token consumption.
 * Toggle: /compress on|off|verbose|status
 * Supports EN + IT. Zero LLM calls.
 */

import { joinSession } from "@github/copilot-sdk/extension";
import { compressText }      from "./src/compress.mjs";
import { extractCodeBlocks, restoreCodeBlocks } from "./src/code-blocks.mjs";
import { detectLang }        from "./src/lang-detect.mjs";

// ─── Session state ────────────────────────────────────────────────────────────
let session;
let compressEnabled = false;
let verboseMode     = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0 };

// ─── /compress command handler ────────────────────────────────────────────────
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
    const pct = stats.originalChars > 0
      ? Math.round((1 - stats.compressedChars / stats.originalChars) * 100)
      : 0;
    const tokensSaved = Math.round((stats.originalChars - stats.compressedChars) / 4);
    await session.log([
      `Compression: ${compressEnabled ? '**ON**' : '**OFF**'} · Verbose: ${verboseMode ? '**ON**' : '**OFF**'}`,
      `Session: ${stats.messageCount} msgs · ${stats.originalChars.toLocaleString()} → ${stats.compressedChars.toLocaleString()} chars (-${pct}%) · ~${tokensSaved.toLocaleString()} tokens saved`,
    ].join('\n'));
    return;
  }
  await session.log('Unknown subcommand. Usage: `/compress on|off|verbose|status`');
}

// ─── Extension entry point ────────────────────────────────────────────────────
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
      const text = (input.prompt ?? '').trim();
      if (!text) return undefined;

      // Pass-through when disabled
      if (!compressEnabled) return undefined;

      // Compression pipeline
      try {
        const originalLen = text.length;
        const { stripped, slots } = extractCodeBlocks(text);
        const lang = detectLang(stripped);
        const compressedStripped = compressText(stripped, lang);
        const finalText = restoreCodeBlocks(compressedStripped, slots);
        const compressedLen = finalText.length;
        const pct = Math.round((1 - compressedLen / originalLen) * 100);

        // Update session stats
        stats.originalChars   += originalLen;
        stats.compressedChars += compressedLen;
        stats.messageCount    += 1;

        // Build LLM note
        const note = `\n\n_(raw message compressed: ${originalLen.toLocaleString()} → ${compressedLen.toLocaleString()} chars, -${pct}%)_`;

        // Verbose line (ephemeral — shown in session, not sent to LLM)
        if (verboseMode) {
          const tokensSaved = Math.round((originalLen - compressedLen) / 4);
          session.log(
            `[compress] ${originalLen.toLocaleString()} → ${compressedLen.toLocaleString()} chars (-${pct}%) · ~${tokensSaved.toLocaleString()} tokens saved`,
            { ephemeral: true },
          ).catch(() => {});
        }

        return { modifiedPrompt: finalText + note };
      } catch {
        // Never crash the hook — return undefined = pass through unchanged
        return undefined;
      }
    },
  },
});
```

**`let session` forward reference:** `handleCompressCommand` calls `session.log()` but
`session` is assigned after `joinSession()` returns. Declaring `let session` at module
scope and assigning via `session = await joinSession(...)` resolves this — the handler
is only ever called after `joinSession` completes. Pattern sourced from
`copilot-ledger/extension/extension.mjs:235`.

### Acceptance criteria

```
1. Install extension (see Phase 6 install steps)
2. Start Copilot CLI session
3. Type: /compress status
   → Output: "Compression: OFF · Verbose: OFF\nSession: 0 msgs..."
4. Type: /compress on
   → Output: "Compression ON (lang: auto-detect, EN/IT)"
5. Type a plain English sentence: "Can you please fix the build and run the tests"
   → Message is sent to LLM compressed. LLM note visible in the turn.
6. Type: /compress status
   → Message count = 1, chars reduced
7. Type: /compress off
   → Output: "Compression OFF"
8. Type same sentence again → sent unchanged to LLM (no note)
```

---

## Phase 5 — Verbose Mode + Session Log

**Complexity:** S  
**Estimated time:** 1 hour  
**Depends on:** Phase 4 complete

### Files to modify

| File | Change |
|---|---|
| `extension.mjs` | Verify `session.log` verbose line fires correctly; confirm `.catch(() => {})` guard is in place |

### Steps

The Phase 4 skeleton already wires `session` as a forward reference and calls
`session.log(..., { ephemeral: true }).catch(() => {})` in the verbose path.
Phase 5 is a live verification pass — no structural code change expected.

1. Confirm `let session;` is declared at module scope (not inside any function).
2. Confirm `session = await joinSession(...)` (assignment, not `const`/`await` bare).
3. Confirm the verbose `session.log` call has `.catch(() => {})` — it must never throw
   inside the hook.
4. Run the Phase 5 acceptance criteria manually.

### Acceptance criteria

```
1. /compress on
2. /compress verbose
   → "Verbose ON"
3. Send a prose message
   → Verbose line appears in session (ephemeral, not sent to LLM):
      "[compress] 312 → 107 chars (-66%) · ~51 tokens saved"
4. /compress verbose
   → "Verbose OFF"
5. Send another prose message
   → No verbose line in session
```

---

## Phase 6 — Install + Smoke Test

**Complexity:** S  
**Estimated time:** 30 min  
**Depends on:** All previous phases complete

### Install instructions

#### User-scoped install (recommended for personal use)

**Linux / macOS:**
```bash
mkdir -p ~/.copilot/extensions/
cp -r /path/to/copilot-compress ~/.copilot/extensions/copilot-compress
cd ~/.copilot/extensions/copilot-compress
npm install
```

**Windows (pwsh):**
```powershell
$dest = "$env:USERPROFILE\.copilot\extensions\copilot-compress"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Recurse D:\projects\copilot-compress\* $dest
Set-Location $dest
npm install
```

#### Project-scoped install (per-repo)

```bash
mkdir -p .github/extensions/
cp -r /path/to/copilot-compress .github/extensions/copilot-compress
cd .github/extensions/copilot-compress
npm install
```

### Run all unit tests

```bash
cd D:\projects\copilot-compress
node --test src/compress.test.mjs
node --test src/code-blocks.test.mjs
node --test src/lang-detect.test.mjs
```

Or run all at once:
```bash
node --test src/*.test.mjs
```

### Smoke test sequence (live Copilot CLI session)

After install, open a Copilot CLI session in any repo and run:

```
/compress status
```
Expected: `Compression: OFF · Verbose: OFF · Session: 0 msgs, 0 → 0 chars (-0%) · ~0 tokens saved`

```
/compress on
```
Expected: `Compression ON (lang: auto-detect, EN/IT)`

```
Please fix the build and make sure the tests are passing before the merge
```
Expected: LLM receives a compressed version. The turn in Copilot CLI chat shows the
note `_(raw message compressed: N → M chars, -P%)_` appended.

```
/compress verbose
```
Expected: `Verbose ON`

```
Puoi per favore rivedere quindi il codice e controllare che il sistema funzioni
```
Expected: Italian detected, compressed. Verbose line in session: `[compress] N → M chars (-P%) · ~K tokens saved`

```
/compress status
```
Expected: 2 msgs, accurate char counts.

```
/compress off
/compress status
```
Expected: `Compression: OFF`. Stats persist.

```
/clear
/compress status
```
Expected: stats reset to 0. State fully cleared.

---

## Open Questions (Gio must decide before or during Phase 4)

### OQ-1: Verbose output channel
**Question:** Should the per-message verbose line appear in the Copilot CLI session chat
(via `session.log` with `{ ephemeral: true }`), or is `process.stderr` output sufficient
(goes to Copilot CLI's debug log, visible only with debug mode on)?

**Recommendation:** `session.log` with `{ ephemeral: true }` — visible in normal session,
labeled ephemeral so it's clear it's metadata not conversation. Matches the olly extension
pattern.

**Blocks:** Phase 5.

---

### OQ-2: Attached file content in `input.prompt`
**Question:** When a user attaches a code file in Copilot CLI (e.g., via `@file`), does
that content appear inline in `input.prompt`, or is it injected separately outside the
hook's input?

**Impact:** If it appears in `input.prompt`, code block detection must be verified to
catch it. If it's injected separately, Req #3 ("Exclude attached code files") is
satisfied automatically.

**Resolution path:** Check `input` object structure during Phase 4 by logging
`JSON.stringify(Object.keys(input))` in the hook when a file is attached. One live test
is sufficient.

**Blocks:** Req #3 correctness verification. Does not block Phase 4 implementation.

---

### OQ-3: Language detection default for ambiguous messages
**Question:** Short messages (< 3 words) default to `'en'`. Is this acceptable, or
should there be a session-level language override (`/compress lang it`) for users who
primarily write in Italian?

**Recommendation:** Acceptable for v1. Auto-detect covers the real use case. A session
override can be added in v2 if false-positives on short Italian messages are observed.

**Blocks:** Nothing in v1.

---

### OQ-4: LLM note wording
**Question:** Req #4 specifies: `(raw message compressed, see session for full content)`.
The current design embeds the note in `modifiedPrompt` as Markdown italic. Is the exact
wording mandated, or is the current format (`_(raw message compressed: N → M chars, -P%)_`)
acceptable?

**Recommendation:** Keep the stats-enriched version — it gives the LLM better context
about how much was removed. If the LLM should not see the compression ratio (to avoid
influencing responses about message quality), revert to the verbatim wording from Req #4.

**Blocks:** Phase 4 (cosmetic — easy to change at any point).
