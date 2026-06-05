# Functional Requirements: copilot-compress

## Project Overview

**copilot-compress** is a GitHub Copilot CLI extension that reduces token consumption by intelligently compressing user prompts before they are sent to the LLM. It operates as a stateful, user-controlled session tool that applies algorithmic text reduction (removing filler words, articles, stopwords, and normalizing whitespace) without invoking external LLM services. The extension is designed to be installed either per-project (`.github/extensions/`) or user-wide, and provides optional verbose feedback to the user while preserving the full uncompressed content in session history for reference and debugging.

The compression algorithm is language-aware, supporting English and Italian in the initial release. Code blocks and attached code files are explicitly preserved unmodified to maintain syntactic and semantic correctness. When compression is active, the LLM is notified via a standardized metadata note appended to the payload, ensuring transparency and enabling better LLM context interpretation.

This extension targets users who frequently interact with Copilot CLI in token-constrained scenarios (e.g., working with large codebases, context-heavy discussions, or operating under billing limits) and who are willing to accept minor prose degradation in exchange for measurable token savings.

---

## Functional Requirements

### FR-01: Session State Toggle

**Description:**  
Users must be able to activate and deactivate prompt compression for the current session using slash commands.

**Acceptance Criteria:**
- `/compress on` activates compression for all subsequent user messages in the session
- `/compress off` deactivates compression; subsequent messages are sent uncompressed
- Toggle state persists across multiple user messages within the same session
- Toggle state is reported to the user with a confirmation message (e.g., "Compression: ON" or "Compression: OFF")
- State resets to OFF when the user invokes `/clear` (default Copilot CLI session-clear behavior)

---

### FR-02: Verbose Mode Feedback

**Description:**  
When requested, the extension must display compression statistics to the user, showing the reduction in token count and percentage saved.

**Acceptance Criteria:**
- `/compress verbose` enables verbose mode for the session (independent of on/off state)
- When compression is ON and verbose is enabled, after each compression operation, display: `[Compression] {original_token_count} → {compressed_token_count} tokens (-{percentage}%)`
- Token count calculation must use OpenAI token estimation rules (e.g., GPT tokenizer; fallback to character-based heuristic if unavailable)
- Verbose statistics are shown to the user in the CLI output but are NOT sent to the LLM
- `/compress verbose` can be toggled on/off independent of on/off compression state

---

### FR-03: Prompt Compression Algorithm (English)

**Description:**  
The extension must implement an English-language compression algorithm that removes filler words, articles, stopwords, and excessive whitespace while preserving meaning.

**Acceptance Criteria:**
- Algorithm removes common English filler words: "basically", "really", "honestly", "actually", "literally", "like", "you know", "sort of", "kind of", "just", "anyway", "in a sense", and their variations
- Algorithm removes English articles: "a", "an", "the" (except when preserving code or leading article in proper nouns)
- Algorithm removes common stopwords: "and", "or", "but", "that", "this", "is", "are", "was", "were", "be", "been" (context-dependent; do not remove if removal creates ambiguity)
- Algorithm collapses multiple whitespace (spaces, tabs, newlines) to single spaces
- Algorithm preserves single newlines between sentences or logical blocks (do not collapse to single line)
- Compression ratio on typical prose targets 40–60% reduction in character count
- Output is always well-formed text (no orphaned punctuation, balanced parentheses where possible)

---

### FR-04: Prompt Compression Algorithm (Italian)

**Description:**  
The extension must implement an Italian-language compression algorithm compatible with Italian syntax and morphology.

**Acceptance Criteria:**
- Algorithm removes common Italian filler words and phrases: "cioè", "diciamo", "insomma", "praticamente", "fondamentalmente", "essenzialmente", "per così dire", "in un certo senso", and single-word fillers ("ma", "allora", "comunque" in non-essential contexts)
- Algorithm removes Italian articles: "il", "lo", "la", "i", "gli", "le", "un", "uno", "una" (context-dependent; preserve in proper nouns)
- Algorithm removes contracted prepositions where safe: "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli", "alle"
- Algorithm collapses multiple whitespace to single spaces
- Algorithm preserves logical line breaks between sentences or semantic units
- Compression ratio on typical Italian prose targets 40–60% reduction in character count
- Output is valid Italian text with preserved morphological agreement

---

### FR-05: Code Block Preservation

**Description:**  
Code blocks (enclosed in triple backticks) and attached code files must not be compressed, regardless of compression state.

**Acceptance Criteria:**
- Code blocks delimited by ` ``` ` are detected and extracted before compression
- Content within code blocks is passed through unmodified to the compressed output
- Code blocks are reinserted at their original positions in the message
- Attached files (if they are code files: `.ts`, `.js`, `.py`, `.go`, `.java`, etc.) are not compressed
- Language specifiers in code blocks (e.g., ` ```javascript `) are preserved
- Nested or malformed code blocks default to safe behavior: if parsing is ambiguous, do not compress the section

---

### FR-06: Multi-language Detection

**Description:**  
The extension must detect the language of the user's message and apply the appropriate compression algorithm.

**Acceptance Criteria:**
- Language detection runs on the user's message before compression
- If English is detected (or dominant), use English compression rules
- If Italian is detected (or dominant), use Italian compression rules
- If mixed language or undetermined, apply English rules as fallback
- Detection must be fast and not require external API calls (use heuristic approach: stopword frequency, character patterns)
- Users may optionally override language detection via configuration (future v2 feature, not in scope for v1 but architecture must support it)

---

### FR-07: Context and File Compression

**Description:**  
Compression must apply to both user message text AND attached context/file content (excluding code files per FR-05).

**Acceptance Criteria:**
- If user attaches files (prose, markdown, documentation), their content is compressed using the detected language rules
- Attached code files are excluded from compression (passed through unchanged)
- Attached structured files (JSON, YAML, CSV) are NOT compressed (passed through unchanged)
- Compression is applied after file content is read but before aggregation into the final payload
- Attachment metadata (filename, size, MIME type) is not modified

---

### FR-08: LLM Notification Metadata

**Description:**  
When compression is active, a metadata note must be appended to the LLM payload indicating that compression occurred.

**Acceptance Criteria:**
- The note "(raw message compressed, see session for full content)" is appended to the end of the compressed message
- This note is sent ONLY to the LLM (in the payload), NOT displayed to the user
- Note is appended after all content compression is complete but before the message is sent
- Note is included only when compression state is ON; if OFF, no note is appended
- Note placement: after all user message and file content, before LLM processing

---

### FR-09: Raw Content Preservation in Session History

**Description:**  
The full, uncompressed user message and attached files must be preserved in the Copilot CLI session history for user reference and debugging.

**Acceptance Criteria:**
- Original (uncompressed) user input is stored in the session state/database/log
- Only the compressed version is sent to the LLM
- User can access the raw message via CLI session history or debug logs
- Session history shows both raw and compressed versions when verbose mode is enabled
- Preserved content does not degrade performance or create storage issues (reasonable compression of raw history logs is allowed)

---

### FR-10: Extension Installation and Distribution

**Description:**  
The extension must be installable as a Copilot CLI extension following standard GitHub Copilot CLI extension architecture.

**Acceptance Criteria:**
- Extension is packaged as `extension.mjs` (ES module, Node.js compatible)
- Per-project installation: `.github/extensions/copilot-compress/extension.mjs`
- User-wide installation: `~/.copilot/extensions/copilot-compress/extension.mjs`
- Extension exports required Copilot CLI hooks (e.g., `onMessage`, `onSessionStart`, command registration)
- Extension initializes and activates without errors or warnings on `copilot` CLI startup
- Extension does not interfere with other Copilot CLI extensions
- Installation instructions are clear and tested (documented in README.md)

---

### FR-11: Command Interface

**Description:**  
The extension must register and respond to three slash commands with clear, consistent syntax.

**Acceptance Criteria:**
- `/compress on` is recognized and toggles compression state to ON
- `/compress off` is recognized and toggles compression state to OFF
- `/compress verbose` is recognized and toggles verbose mode (independent of on/off state)
- Each command returns a user-friendly confirmation message
- Commands are case-insensitive (e.g., `/COMPRESS ON` works identically to `/compress on`)
- Commands can be invoked at any point in the session
- Invalid commands (e.g., `/compress invalid`) return a helpful error message listing valid options

---

### FR-12: Performance and Latency

**Description:**  
Compression operations must not introduce noticeable latency in the user interaction loop.

**Acceptance Criteria:**
- Compression of a typical prose message (< 5,000 characters) completes in < 100ms
- Token counting (or estimation) completes in < 50ms
- Total overhead per message send (compression + token count + metadata appending) is < 200ms
- No blocking I/O during compression
- Memory footprint of the extension (loaded into Copilot CLI) is < 2 MB
- No memory leaks across repeated compress/decompress cycles (validate via profiling)

---

### FR-13: Error Handling and Graceful Degradation

**Description:**  
The extension must handle errors gracefully and never break the Copilot CLI user experience.

**Acceptance Criteria:**
- If compression fails (e.g., unsupported input), the original uncompressed message is sent to the LLM with a warning logged
- If language detection fails, default to English and log the event
- If token counting fails, gracefully skip verbose feedback but continue compressing
- Errors are logged to stderr or extension logs (configurable verbosity level)
- Extension state remains consistent even after errors; no corrupted or orphaned state
- If the extension encounters an unrecoverable error, it disables itself and notifies the user

---

### FR-14: Configuration and Settings

**Description:**  
Users and administrators must be able to configure compression behavior.

**Acceptance Criteria:**
- Configuration file location: `~/.copilot/copilot-compress-config.json` (user-level) or `.github/copilot-compress-config.json` (project-level)
- Supported settings: `enabled` (default: false), `defaultLanguage` (EN or IT), `verboseMode` (default: false), `logLevel` (debug, info, warn, error)
- Project-level config overrides user-level config
- Config changes take effect on next session (or on `/compress refresh` if implemented)
- Invalid config files are logged but do not crash the extension
- Extension provides a sensible default configuration if no config file is found

---

### FR-15: Logging and Debugging

**Description:**  
The extension must provide detailed logs for troubleshooting and performance monitoring.

**Acceptance Criteria:**
- All compression events are logged with: timestamp, input size, output size, compression ratio, language detected
- Command invocations are logged (e.g., "User toggled compression ON")
- Errors and warnings are logged with stack traces (in debug mode)
- Logs are written to: `~/.copilot/copilot-compress.log` (user-level)
- Log rotation is implemented (e.g., daily rotation or size-based rotation to prevent unbounded growth)
- Log level can be controlled via config or CLI flag
- Sensitive data (e.g., message content) is NOT logged by default (logging can be enabled for debug mode only)

---

## Non-Functional Requirements

### NFR-01: Language Support

The extension must support English and Italian in v1. Support for additional languages is deferred to v2+.

**Criteria:**
- EN (English) compression rules are fully functional and tested
- IT (Italian) compression rules are fully functional and tested
- Language detection defaults to EN if language is ambiguous
- Adding new languages in future versions must not require architectural changes

---

### NFR-02: Compatibility

The extension must be compatible with current and recent versions of GitHub Copilot CLI.

**Criteria:**
- Tested and working on Copilot CLI v1.0.0 and later
- Compatible with Node.js 18.x and 20.x
- No hard dependency on OS-specific features (cross-platform: Windows, macOS, Linux)
- Extension follows ES module standards (no CommonJS if possible)

---

### NFR-03: Maintainability

Code must be clear, well-documented, and easy to extend.

**Criteria:**
- All functions have JSDoc comments explaining purpose, inputs, outputs, and language-specific behavior
- Regular expressions for stopword/filler detection are externalized to constants with comments
- Compression logic is modular: separate functions for English, Italian, token counting, code detection
- No hardcoded magic numbers; use named constants
- Code follows consistent style (ESLint config provided)

---

### NFR-04: Testing

Comprehensive test coverage for compression algorithms and edge cases.

**Criteria:**
- Unit tests for English compression (70+ assertions on various prose, edge cases)
- Unit tests for Italian compression (70+ assertions on various prose, edge cases)
- Unit tests for code block detection and preservation
- Unit tests for language detection (edge cases: mixed language, short snippets)
- Integration tests simulating CLI commands (`/compress on`, `/compress off`, `/compress verbose`)
- Test coverage target: > 85% for compression logic
- All tests pass before release

---

### NFR-05: Security

The extension must not introduce security vulnerabilities.

**Criteria:**
- No eval() or dynamic code execution on user input
- No arbitrary file system access outside of configuration/log directories
- Message content is never written to unprotected logs in production
- Extension does not intercept or modify authentication tokens or credentials
- Input validation: reject malformed commands, oversized inputs (e.g., > 100 MB)

---

### NFR-06: Performance

Token-efficient operation without adding significant overhead.

**Criteria:**
- Compression algorithm runs in O(n) time (linear in message length)
- No quadratic or exponential complexity
- Memory usage is proportional to input size (no unbounded data structures)
- Token counting is fast enough to not delay command execution

---

### NFR-07: Accessibility

User interactions must be clear and non-confusing.

**Criteria:**
- Command syntax is simple and memorable (`/compress on`, `/compress off`, `/compress verbose`)
- Confirmation messages are clear and unambiguous
- Verbose output is readable and formatly consistent
- Error messages guide the user toward resolution

---

## Out of Scope (v1)

The following features and enhancements are **explicitly deferred to v2 or beyond**:

1. **LLM-assisted compression** — using Claude, GPT, or another model to intelligently rewrite messages. (v1 is algorithmic-only per design decision #6)

2. **Machine learning-based language detection** — using ML models to detect language or optimize compression. (v1 uses heuristic detection)

3. **Multi-language support beyond EN and IT** — e.g., Spanish, French, German, etc. (v1 supports only English and Italian per design decision #7)

4. **Manual compression hint syntax** — e.g., `@keep-this-phrase` or `@compress-this-section`. (v1 applies blanket compression)

5. **Compression statistics dashboard or UI** — e.g., a graphical report of compression over time. (v1 provides CLI output only)

6. **Integration with GitHub's pricing/cost estimation API** — translating token savings to dollar savings. (v1 shows token counts only)

7. **Ability to pause/resume compression mid-session without `/clear`** — current state reset mechanism is via `/clear`. (Enhancement for v2)

8. **Context-aware stopword filtering** — e.g., preserving "the" in titles or proper nouns intelligently. (v1 uses blanket rules)

9. **User-defined stopword lists** — allowing users to customize which words are removed. (v1 uses predefined lists)

10. **Real-time compression suggestion/preview before sending** — showing the user what will be compressed before they send. (v1 compresses after send)

---

## Definition of Done (DoD)

The extension is considered **shippable** when all of the following criteria are met:

### Code Quality & Standards
- [ ] All JavaScript code passes ESLint with project configuration (no warnings)
- [ ] All code follows consistent naming conventions (camelCase for functions/variables, UPPER_SNAKE_CASE for constants)
- [ ] All functions and modules have JSDoc comments with @param, @returns, and @throws tags
- [ ] No hardcoded magic numbers; all constants are named and documented
- [ ] Cyclomatic complexity of functions is ≤ 10 (measured by ESLint or similar tool)

### Functional Requirements
- [ ] FR-01: Session toggle (`/compress on`, `/compress off`) works correctly and state persists across messages
- [ ] FR-02: Verbose mode (`/compress verbose`) displays correct compression stats (original → compressed tokens, percentage)
- [ ] FR-03: English compression algorithm removes filler words, articles, and stopwords; achieves ~40–60% reduction on test prose
- [ ] FR-04: Italian compression algorithm removes Italian fillers, articles, and contracted prepositions; achieves ~40–60% reduction on test prose
- [ ] FR-05: Code blocks (triple-backtick) and `.ts`, `.js`, `.py`, `.go`, `.java` files are NOT compressed and pass through unchanged
- [ ] FR-06: Language detection correctly identifies English and Italian; defaults to English if ambiguous
- [ ] FR-07: Attached non-code files (markdown, plain text) are compressed; code files are excluded
- [ ] FR-08: LLM payload includes the note "(raw message compressed, see session for full content)" when compression is ON
- [ ] FR-09: Full uncompressed message is preserved in session history; user can view raw content
- [ ] FR-10: Extension installs per-project (`.github/extensions/`) and user-wide (`~/.copilot/extensions/`)
- [ ] FR-11: Three commands (`/compress on`, `/compress off`, `/compress verbose`) are recognized, case-insensitive, and return clear confirmation
- [ ] FR-12: Compression completes in < 100ms for typical messages; total overhead < 200ms per message
- [ ] FR-13: Errors are caught and logged; if compression fails, original message is sent to LLM with warning
- [ ] FR-14: Configuration file (`~/.copilot/copilot-compress-config.json`) is read and applied; project config overrides user config
- [ ] FR-15: All events (compression, commands, errors) are logged to `~/.copilot/copilot-compress.log` with appropriate verbosity

### Testing
- [ ] Unit tests written and passing for English compression (70+ assertions including edge cases: empty strings, only punctuation, mixed case, etc.)
- [ ] Unit tests written and passing for Italian compression (70+ assertions including edge cases: contractions, accented characters, etc.)
- [ ] Unit tests written and passing for code block detection and preservation (nested blocks, malformed blocks, language specifiers)
- [ ] Unit tests written and passing for language detection (EN, IT, mixed, undetermined cases)
- [ ] Unit tests written and passing for token counting or estimation
- [ ] Integration tests written and passing for CLI commands (toggle on/off, verbose, state reset on /clear)
- [ ] Test coverage ≥ 85% for compression logic (measured by nyc or similar tool)
- [ ] All tests pass in CI/CD pipeline

### Documentation
- [ ] README.md created with:
  - [ ] Project description and purpose
  - [ ] Installation instructions (per-project and user-wide)
  - [ ] Usage examples for each command (`/compress on`, `/compress off`, `/compress verbose`)
  - [ ] Configuration guide (config file format, default settings, examples)
  - [ ] Language support matrix (EN, IT)
  - [ ] Performance benchmarks (typical reduction %, latency measurements)
  - [ ] Troubleshooting section (common issues and solutions)
  - [ ] Contributing guidelines (for future maintainers)
- [ ] ARCHITECTURE.md or design doc created explaining:
  - [ ] How the extension hooks into Copilot CLI
  - [ ] Compression algorithm overview (high-level flow)
  - [ ] Language detection approach
  - [ ] State management (session-level state, persistence, reset behavior)
  - [ ] Error handling strategy
- [ ] Inline code comments explaining regex patterns, edge cases, and non-obvious logic
- [ ] CHANGELOG.md with entry for v1.0.0 (initial release)

### Distribution & Installation
- [ ] Extension packaged as `extension.mjs` (ES module, standard Copilot CLI format)
- [ ] All dependencies declared in `package.json` with pinned versions (no floating versions like `^1.0.0`)
- [ ] Extension loads without errors or warnings when Copilot CLI starts
- [ ] No conflicts with other extensions or Copilot CLI core functionality
- [ ] Installation tested on Windows, macOS, and Linux

### Performance & Reliability
- [ ] Compression of 1,000-character message completes in < 100ms (measured on standard hardware)
- [ ] Token counting completes in < 50ms
- [ ] Total overhead per message ≤ 200ms
- [ ] Memory profiling shows no memory leaks across 100+ compress/decompress cycles
- [ ] Memory footprint of loaded extension ≤ 2 MB
- [ ] All CLI commands respond with < 50ms latency
- [ ] State remains consistent after errors; no corrupted or orphaned state

### Security & Privacy
- [ ] No use of eval(), dynamic code execution, or code generation from user input
- [ ] No arbitrary file system access outside of `~/.copilot/` and project directories
- [ ] User message content not written to production logs (debug logs only if explicitly enabled)
- [ ] No sensitive data (credentials, tokens) exposed in logs or error messages
- [ ] Input validation: reject malformed commands, inputs > 100 MB
- [ ] Configuration file permissions are secure (not world-readable if created)

### Deployment & Release
- [ ] Git repository is public and clean (no secrets, no build artifacts)
- [ ] All code is committed to main branch or release branch with clear commit messages
- [ ] Release tag created (e.g., `v1.0.0`) with annotated commit message summarizing changes
- [ ] GitHub Releases page populated with v1.0.0 release notes
- [ ] If distributed via npm, package published with correct metadata (name, version, description, keywords, repository link)
- [ ] Installation via npm or direct git clone is tested and verified

### Acceptance by Stakeholder
- [ ] Gio (product owner) reviews and approves the implementation
- [ ] Gio confirms that compression works as designed and meets all design decisions
- [ ] Gio validates that token savings are meaningful (40–60% reduction on test cases)
- [ ] Gio signs off on the quality and readiness for release

---

## Success Metrics (v1.0.0 Release)

At release, the following metrics should be achievable:

| Metric | Target | Measurement |
|--------|--------|-------------|
| English prose compression | 40–60% reduction | Compare original vs. compressed character/token count on 50+ test cases |
| Italian prose compression | 40–60% reduction | Compare original vs. compressed character/token count on 50+ test cases |
| Compression latency | < 100ms | Time compression algorithm from start to output (1,000 char input) |
| Code block preservation | 100% accuracy | All code blocks and code files pass through unchanged |
| Language detection accuracy | ≥ 95% | Correct language identified on >95% of EN/IT test cases |
| Test coverage | ≥ 85% | Coverage of compression logic, command handling, edge cases |
| Installation success rate | 100% | Extension installs without errors on tested OS/Node versions |

---

**Document Version:** 1.0  
**Date:** 2025-01-XX  
**Status:** Ready for Implementation  
**Owner:** Marco (Business Analyst)
