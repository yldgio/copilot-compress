# Execution Plan — copilot-compress v2 Upgrade

**Based on**: `prd.md` + `architecture.md`  
**Date**: 2026-06-11  
**Target releases**: v1.1.0 (Wave 1) · v1.2.0 (Wave 2) · v1.3.0 (Wave 3)

---

## Wave 1 — Prompt Compression Engine (target: v1.1.0)

Goal: 40–60% token savings on EN/IT prompt text. Zero breaking changes.

### Slice 1.A — Data Format Safety + Slot Shape Change *(foundation, no deps)*

**Why first**: Everything else in Wave 1 depends on the new `Map<string, {raw, lang}>` slot shape and the data format bypass. This slice has no dependencies and unblocks all others.

| Task | File | Notes |
|------|------|-------|
| Change `extractCodeBlocks` return shape | `src/code-blocks.mjs` | `Map<string,string>` → `Map<string,{raw,lang}>`. `restoreCodeBlocks` reads `.raw` |
| Update `code-blocks.test.mjs` | `src/code-blocks.test.mjs` | Fix assertions that read slot values directly |
| Create `src/data-format.mjs` | new | `isDataFormat(lang): bool` safelist (json/yaml/yml/toml/csv/xml) + unfenced heuristic |
| Create `src/data-format.test.mjs` | new | Safelist coverage + unfenced JSON/YAML bypass + fail-closed |
| Update `extension.mjs` pipeline | `extension.mjs` | Step 1: check data format bypass before any compression |

**Verification**: `npm test` green (23+ tests). Existing behavior unchanged for non-data content.

---

### Slice 1.B — Intensity Level System *(depends on 1.A)*

**Why here**: Introduces the `intensity` session state and updates command dispatch. Needed before any intensity-gated feature can be wired.

| Task | File | Notes |
|------|------|-------|
| Add `intensity` state field | `extension.mjs` | `'off' \| 'minimal' \| 'standard' \| 'aggressive'` · default when `/compress on` = `'standard'` |
| Update `/compress` command dispatch | `extension.mjs` | `/compress on` → `standard`, `/compress off` → `off`, `/compress intensity <level>` → set level |
| Update `/compress status` output | `extension.mjs` | Show intensity level + mode |
| Accept `intensity` param in `compressText` | `src/compress.mjs` | Pass through for now (used in 1.C/1.D) |

**Verification**: `/compress on`, `/compress off`, `/compress intensity aggressive`, `/compress status` all behave correctly. All existing tests green.

---

### Slice 1.C — Deeper Filler/Hedging Taxonomy *(depends on 1.B)*

**Why here**: Pure additive change to `compress.mjs`. Intensity enum from 1.B gates which passes run.

| Task | File | Notes |
|------|------|-------|
| Add hedging patterns (EN) | `src/compress.mjs` | `I think`, `probably`, `sort of`, `maybe`, `it seems`, `I believe`, `I suppose` — `standard`+`aggressive` only |
| Add pleasantry patterns (EN) | `src/compress.mjs` | `Sure!`, `Happy to help`, `Of course`, `Certainly`, `Absolutely` — all levels above `off` |
| Add connective patterns (EN) | `src/compress.mjs` | `however`, `in order to`, `with that said`, `as a result`, `due to the fact that` — `standard`+`aggressive` |
| Expand Italian filler taxonomy | `src/compress.mjs` | Extend `IT_SINGLE_WORDS` + `IT_PHRASES` with hedging equivalents |
| Add safety gate | `src/compress.mjs` | Fire at step 4: if result < 5 words or proper noun ratio > 40% → return `undefined` |
| Extend `compress.test.mjs` | `src/compress.test.mjs` | Intensity-gated behavior, hedging removal, safety gate trigger |

**Verification**: `npm test` green. Verbose mode shows improved savings on prose samples.

---

### Slice 1.D — Code Comment Stripping *(depends on 1.A + 1.B)*

**Why here**: Requires the `{raw, lang}` slot shape from 1.A and the intensity enum from 1.B. `aggressive` mode only.

| Task | File | Notes |
|------|------|-------|
| Create `src/comment-strip.mjs` | new | `stripComments(code, lang): string` — patterns per language (js/ts/py/rs/go/sh). Unsupported → return original |
| Wire into `code-blocks.mjs` | `src/code-blocks.mjs` | After slot extraction, if `intensity === 'aggressive'` and lang is supported → apply `stripComments` to slot `.raw` |
| Create `src/comment-strip.test.mjs` | new | Per-language stripping, unsupported tag passthrough, data format lang bypass |

**Verification**: `npm test` green. JS/TS/Python/Rust/Go/Shell comments stripped in slots at `aggressive`. Other languages untouched.

---

### Slice 1.E — Post-Compression Validator *(depends on 1.B)*

**Why here**: Final safety net. Wired after the full compression pipeline. Can be developed in parallel with 1.C/1.D.

| Task | File | Notes |
|------|------|-------|
| Create `src/validator.mjs` | new | `validate(original, compressed): bool` — heading count, URL set, inline backtick count |
| Wire into `extension.mjs` pipeline | `extension.mjs` | After compression: if `!validate(original, compressed)` → fallback to original, log in verbose |
| Create `src/validator.test.mjs` | new | Heading mismatch → fallback, URL loss → fallback, valid → pass |

**Verification**: `npm test` green. Corrupt output never reaches LLM.

---

### Slice 1.F — Token Estimation + Build + Release *(depends on 1.A–1.E)*

**Why last**: Integrates everything, then ships.

| Task | File | Notes |
|------|------|-------|
| Create `src/token-estimate.mjs` | new | `estimateTokens(text, model?): number` — Claude: `/3.5`, GPT-4: `/4`, unknown: `/4` |
| Replace hardcoded `/4` in `extension.mjs` | `extension.mjs` | Use `estimateTokens()` at lines 42 and 89 |
| Update verbose output | `extension.mjs` | Show intensity level + model family in stats |
| `npm run build` → commit `dist/` | `dist/extension.mjs` | Rebuild bundle |
| Update `CHANGELOG.md` | `CHANGELOG.md` | v1.1.0 entry |
| Bump version in `package.json` | `package.json` | `1.0.0` → `1.1.0` |
| Tag + push `v1.1.0` | git | Triggers release workflow → GitHub Release |

**Verification**: CI green, release workflow green, `--remote` install gets `v1.1.0`, `/compress status` shows new fields.

---

## Wave 2 — Tool Output Compression (target: v1.2.0)

**Blocker**: ✅ RESOLVED (2026-06-11) — `onPostToolUse` is confirmed available in `@github/copilot-sdk` (`types.d.ts:872`).

Hook contract:
- Input: `{ toolName: string, toolArgs: unknown, toolResult: ToolResultObject }`
- Output: `{ modifiedResult?: ToolResultObject, additionalContext?: string, suppressOutput?: boolean }`
- Fires for successful tool results only. Register `onPostToolUseFailure` separately for failures.
- Known SDK bug: if multiple extensions register `onPostToolUse`, only the last-loaded fires (issue #2076). Non-issue for copilot-compress (sole extension with this hook).

### Slice 2.A — Tool Output Filter Module

| Task | File | Notes |
|------|------|-------|
| Create `src/tool-compress.mjs` | new | `compressToolOutput(toolName, output, intensity): string` — grep (top 50 lines), view (200 line cap), bash (5KB cap), JSON passthrough |
| Create `src/tool-compress.test.mjs` | new | Per-tool truncation, JSON passthrough, intensity gate |

### Slice 2.B — Wire `onToolResult` Hook

| Task | File | Notes |
|------|------|-------|
| Add `onToolResult` handler | `extension.mjs` | Only when `intensity !== 'off'`. Apply `compressToolOutput`. |
| Update verbose stats | `extension.mjs` | Include tool output savings in `/compress verbose` summary |
| `npm run build` → bump to `v1.2.0` → tag | | |

---

## Wave 3 — Domain Modes (target: v1.3.0)

### Slice 3.A — Domain Mode Engine

| Task | File | Notes |
|------|------|-------|
| Create `src/domain-modes.mjs` | new | `applyDomainMode(text, mode): string` — `commit` (Conventional Commits enforcement + preamble strip), `review` (softening strip + L:N format) |
| Add `mode` state field to `extension.mjs` | `extension.mjs` | `/compress mode <commit\|review\|off>` |
| Create `src/domain-modes.test.mjs` | new | |
| `npm run build` → bump to `v1.3.0` → tag | | |

---

## Dependency Graph

```
1.A (slots + data format)
  ├── 1.B (intensity system)
  │     ├── 1.C (filler taxonomy)     ─┐
  │     ├── 1.D (comment stripping)   ─┤─► 1.F (token est + build + v1.1.0)
  │     └── 1.E (validator)           ─┘
  │
  └── (feeds into Wave 2 + Wave 3)

Wave 2: 1.F done + §15.1 resolved → 2.A → 2.B → v1.2.0
Wave 3: v1.2.0 done → 3.A → v1.3.0
```

**Parallelisable within Wave 1**: Slices 1.C, 1.D, and 1.E can be developed in parallel once 1.A and 1.B are merged.

---

## Open Questions (from architecture.md) — need Gio's decision before implementation

| # | Question | Blocks |
|---|---------|--------|
| §15.1 | ~~Is `onToolResult` available in `@github/copilot-sdk/extension`?~~ ✅ **RESOLVED** — `onPostToolUse` confirmed in `types.d.ts:872`. Output field: `modifiedResult`. Wave 2 unblocked. | ~~Wave 2 entirely~~ |
| §15.2 | Should `minimal` mode strip pleasantries? (Current plan: yes) | Slice 1.C |
| §15.3 | Italian hedging word list — needs review against real session data | Slice 1.C |
| §15.4 | Safety gate proper noun ratio threshold (40% is a hypothesis) | Slice 1.C |

---

## Summary

| Wave | Slices | Est. effort | Target tag | Key unlock |
|------|--------|-------------|-----------|-----------|
| Wave 1 | 1.A → 1.B → {1.C ‖ 1.D ‖ 1.E} → 1.F | ~18–22h | v1.1.0 | 40–60% prompt savings |
| Wave 2 | 2.A → 2.B | ~6–8h | v1.2.0 | 30–70% tool output savings |
| Wave 3 | 3.A | ~4–6h | v1.3.0 | Domain-specific compression |
