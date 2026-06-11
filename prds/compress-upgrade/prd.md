# PRD: copilot-compress v2 — Compression Engine Upgrade

**Status**: Draft  
**Date**: 2026-06-11  
**Owner**: yldgio  

---

## Problem Statement

`copilot-compress` v1 achieves only 15–30% token reduction on EN/IT prose by removing stopwords and filler words. It has no awareness of code comment density, hedging language, or domain-specific patterns. It operates at a single compression intensity with no user control, and it compresses only user prompt text — tool outputs, code block comments, and session context are untouched. As the team's usage scales across more complex multi-file, multi-tool workflows, the marginal benefit of v1 compression is insufficient to meaningfully reduce Copilot cost.

---

## Solution

Upgrade the compression engine across two layers, shipped in independent waves:

- **Wave 1**: Upgrade prompt-text compression from 15–30% to 40–60% savings by introducing compression intensity levels (`lite / full / ultra`), language-aware code comment stripping, a deeper filler/hedging taxonomy, data format safety gates, and post-compression validation.
- **Wave 2**: Extend compression to tool outputs via a new `onToolResult` hook, capturing the 30–70% output token savings identified in the CodeAct analysis.
- **Wave 3**: Domain-specific compression modes (`commit`, `review`) and advanced structural features.

---

## User Stories

### Wave 1 — Prompt Compression Engine

1. As a developer, I want to choose a compression intensity (`lite`, `full`, `ultra`) so that I can balance readability vs. token savings based on my current task.
2. As a developer, I want `/compress lite` to strip only obvious filler and pleasantries, so that the compressed message still reads naturally.
3. As a developer, I want `/compress full` to strip filler, hedging, and mild connectives, so that I get meaningful savings without losing technical precision.
4. As a developer, I want `/compress ultra` to apply aggressive compression including comment stripping and connective removal, so that I maximise token savings on long technical prompts.
5. As a developer, I want the active intensity level to persist across the session, so that I don't have to re-specify it on every message.
6. As a developer, I want `/compress status` to show the active intensity level alongside on/off state, so that I always know what mode I'm in.
7. As a developer, I want inline code comments (e.g. `// TODO`, `# fixme`) stripped from code blocks in my prompt when ultra mode is active, so that pasted code contributes fewer tokens.
8. As a developer writing Python, I want `#` comment lines stripped from pasted Python code in ultra mode, so that docstring-heavy code compresses well.
9. As a developer writing JS/TS, I want `//` and `/* */` comments stripped from pasted code in ultra mode.
10. As a developer writing Rust, Go, or Shell, I want language-specific comment patterns stripped correctly in ultra mode.
11. As a developer, I want JSON, YAML, TOML, CSV, and XML content in my prompt to pass through completely unmodified regardless of intensity level, so that structured data is never corrupted.
12. As a developer, I want hedging phrases (`I think`, `probably`, `sort of`, `maybe`, `it seems`) removed in `full` and `ultra` modes, so that technical messages are more assertive and shorter.
13. As a developer, I want pleasantries and opening formulas (`Sure!`, `Happy to help`, `Of course`, `Certainly`) stripped in all modes above `lite`, so that conversational noise is removed.
14. As a developer, I want connective phrases (`however`, `in order to`, `with that said`, `as a result`, `due to the fact that`) collapsed or removed in `full` and `ultra` modes.
15. As a developer, I want Italian-language hedging and filler patterns expanded (from v1's basic list) to cover a broader set of discourse markers, so that IT prompts compress as effectively as EN prompts.
16. As a developer, I want the extension to refuse to compress a message if it would become ambiguous — specifically if the result is shorter than 5 words or the proper noun ratio exceeds 40% — so that safety is preserved.
17. As a developer, I want `/compress verbose` to show a before/after diff summary (char count, estimated token savings, intensity used), so that I can verify compression behaviour.
18. As a developer, I want headings, URLs, file paths, and inline code references preserved exactly regardless of intensity level, so that technical anchors are never lost.
19. As a developer, I want the post-compression validator to silently fall back to the original message if any preservation invariant fails, rather than sending a corrupted prompt.
20. As a developer, I want to switch intensity mid-session with `/compress intensity ultra` without restarting the session.
21. As a developer, I want `/compress off` to restore the original message unmodified exactly as in v1.
22. As a developer, I want the token estimate in verbose mode to use a per-model multiplier (Claude: /3.5, GPT-4: /4) rather than a fixed /4, so that savings estimates are more accurate.
23. As a team lead, I want the extension to work identically on Windows (CRLF) and Linux/macOS (LF), so that all team members get consistent behaviour.
24. As a developer, I want all new compression transforms to have dedicated unit tests in `src/`, so that regressions are caught in CI.
25. As a developer, I want `npm run build` to bundle all new `src/` modules into `dist/extension.mjs` without any new external dependencies, so that the install footprint stays minimal.

### Wave 2 — Tool Output Compression

26. As a developer, I want grep results truncated to the top 50 matches with filenames+line numbers only (no full line content), so that large grep outputs don't flood the context.
27. As a developer, I want `view` tool output truncated to a configurable line limit (default: 200 lines) when compression is active, so that large file views are summarised.
28. As a developer, I want bash stdout truncated to 5 KB with a `[truncated...]` marker when compression is active.
29. As a developer, I want tool output compression to activate only when `/compress` is enabled, so that opt-out is always possible.
30. As a developer, I want to see tool output compression savings included in `/compress verbose` stats.
31. As a developer, I want JSON tool output to pass through tool compression unmodified (same data format safety as prompt compression).

### Wave 3 — Domain Modes

32. As a developer writing commit messages, I want `/compress mode commit` to enforce Conventional Commits format and strip preamble, so that commit message prompts are always correctly structured.
33. As a developer doing code review, I want `/compress mode review` to strip softening language and enforce `L:N` line-reference format, so that review prompts are direct and precise.
34. As a developer, I want `/compress mode off` to return to general compression mode.
35. As a developer, I want the active domain mode displayed in `/compress status`.

---

## Implementation Waves

### Wave 1 (MVP) — Prompt Compression Engine Upgrade
**Goal**: 40–60% token savings on EN/IT prompt text. Ship as `v1.1.0`.  
**Done when**: All Wave 1 user stories pass tests, CI green, `dist/` rebuilt, `v1.1.0` tag pushed.

Scope:
- `src/compress.mjs` — intensity enum, deeper filler/hedging/connective taxonomy (EN + IT), safety gate
- `src/code-blocks.mjs` — comment stripping per language inside fenced blocks (ultra mode only)
- `src/lang-detect.mjs` — no change required
- `src/data-format.mjs` — NEW: JSON/YAML/TOML/CSV/XML detection and bypass
- `src/validator.mjs` — NEW: post-compression invariant checks (headings, URLs, inline code)
- `extension.mjs` — new session state fields (`intensity`, `mode`), updated `/compress` command dispatch
- `dist/extension.mjs` — rebuilt bundle

### Wave 2 — Tool Output Compression
**Goal**: 30–70% output token savings on verbose tool results. Ship as `v1.2.0`.  
**Done when**: `onToolResult` hook live, grep/view/bash filtering verified, verbose stats updated.

Scope:
- `src/tool-compress.mjs` — NEW: per-tool output filters (grep, view, bash, generic truncation)
- `extension.mjs` — wire `onToolResult` hook
- `dist/extension.mjs` — rebuilt bundle

### Wave 3 — Domain Modes
**Goal**: Commit + review specialised compression. Ship as `v1.3.0`.

Scope:
- `src/domain-modes.mjs` — NEW: commit and review transform pipelines
- `extension.mjs` — `/compress mode <name>` command dispatch

---

## Implementation Decisions

### Intensity Level System
- Enum: `off | lite | full | ultra` (replaces binary on/off; `on` maps to `full` for backward compat)
- Applied in order: data format bypass → code comment stripping → filler taxonomy → validator
- `lite`: pleasantries + obvious fillers only
- `full`: lite + hedging + connectives + deeper taxonomy
- `ultra`: full + code comment stripping + structural collapses

### Code Comment Stripping
- Only applied in `ultra` mode
- Only inside fenced code blocks (after extraction but before compression pass)
- Language detected from the fenced block opening tag (e.g. ` ```python `)
- Supported languages Wave 1: `js`, `ts`, `jsx`, `tsx`, `py`, `python`, `rs`, `rust`, `go`, `sh`, `bash`, `shell`
- Unsupported language tag → pass through unmodified (safe default)
- Operates on the block content in the placeholder slot, not on the raw text

### Data Format Safety
- Detection by fenced block language tag: `json`, `yaml`, `yml`, `toml`, `csv`, `xml`
- Standalone fenced data blocks → slot extracted and restored without any transform
- Unfenced JSON/YAML snippets (heuristic: starts with `{` or `[`, valid parse) → bypass filler pass
- Fail closed: if detection is uncertain, apply no compression to that segment

### Post-Compression Validator
- Checks: heading count match, URL set equality, inline backtick count match
- On any mismatch → silent fallback to original pre-compression message
- Logged to session buffer (visible in verbose mode)
- NOT a hard error — fallback is the correct behavior

### Session State (new fields)
```
intensity: 'off' | 'lite' | 'full' | 'ultra'   (default: 'full' when /compress on)
mode: 'general' | 'commit' | 'review'           (default: 'general')
```
`/compress on` → sets `intensity = 'full'` (backward compat)  
`/compress off` → sets `intensity = 'off'`

### Token Estimation
- Model hint from env or detected from session context
- Multipliers: Claude family → `/3.5`, GPT-4 family → `/4`, unknown → `/4`
- Displayed in verbose mode alongside char counts

### Build & Dependencies
- No new external npm dependencies in Wave 1 or 2
- All new modules are pure ESM, zero imports
- Rollup config unchanged — new `src/` files automatically bundled via import graph
- `dist/extension.mjs` must be rebuilt and committed with every Wave release

### Backward Compatibility Contract
- `/compress on` → equivalent to `intensity = 'full'` (same behavior as v1 on/off)
- `/compress off` → `intensity = 'off'`
- `/compress verbose` → still works, now shows intensity + tool output stats (Wave 2)
- `/compress status` → still works, now shows intensity level
- All existing 23 tests must remain green

---

## Testing Decisions

### What makes a good test
- Test external behavior (input/output of exported functions), not internal implementation
- Each transform strategy has its own test file (`src/<module>.test.mjs`)
- Tests use `node:test` built-in (no Jest/Vitest — consistent with existing suite)
- Property-based invariants: "if input is valid JSON, output is identical to input" (data format safety)
- Regression tests for each fixed bug (see existing pattern in `src/code-blocks.test.mjs`)

### Modules to test
| Module | Test file | Key scenarios |
|--------|-----------|---------------|
| `src/compress.mjs` | `compress.test.mjs` (extend) | Intensity levels, hedging removal, Italian expansion, safety gate |
| `src/code-blocks.mjs` | `code-blocks.test.mjs` (extend) | Comment stripping per language, unsupported tag passthrough |
| `src/data-format.mjs` | `data-format.test.mjs` | JSON/YAML/TOML detection, unfenced heuristic, fail-closed |
| `src/validator.mjs` | `validator.test.mjs` | Heading preservation, URL preservation, fallback trigger |
| `src/tool-compress.mjs` | `tool-compress.test.mjs` | grep truncation, view line limit, bash 5KB cap, JSON passthrough |

### Prior art
- `src/code-blocks.test.mjs` — demonstrates CRLF regression pattern and placeholder slot tests
- `src/compress.test.mjs` — demonstrates filler taxonomy and Italian contracted preposition tests

---

## Out of Scope

- LLM-based semantic summarisation (any transform that calls an AI model)
- Classical Chinese or other non-Latin script support (Wave 1/2)
- Sandbox execution / turn reduction (CodeAct architecture — different product category)
- MCP server schema de-duplication (requires Copilot CLI SDK instrumentation not yet available)
- GUI or dashboard for compression stats
- Publishing to npm registry
- Browser/web extension variant

---

## Further Notes

- The existing `architecture.md` (Hugo's document, `prds/compress-upgrade/architecture.md`) is the authoritative technical reference. This PRD defers all module-level design details to that document.
- All waves ship as tagged GitHub releases. `v1.1.0` → Wave 1, `v1.2.0` → Wave 2, `v1.3.0` → Wave 3.
- The `--remote` installer always pulls `latest`, so users auto-upgrade on next install.
- Italian filler expansion should be validated against real usage data from Gio's sessions before finalising the word list.
- CodeAct-style tool output aggregation (collapsing multi-turn workflows into sandbox execution) is explicitly deferred — it requires architectural changes outside the scope of a Copilot CLI extension.
