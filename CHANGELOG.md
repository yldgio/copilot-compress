# Changelog

## [1.1.0] - 2026-06-11

### Added
- Intensity levels: `lite`, `standard`, `aggressive` (`/compress lite|standard|aggressive`)
- `/compress on` now maps to `standard` intensity (backward compatible)
- Expanded EN filler taxonomy: pleasantries (all levels), hedging and connectives (standard+)
- Expanded IT filler taxonomy: pleasantries and hedging patterns
- Safety gate: fallback to original if compressed result is too short or has high proper-noun density
- Language-aware comment stripping in fenced code blocks (aggressive mode: JS, TS, Python, Rust, Go, Shell)
- Data format safety bypass: JSON, YAML, TOML, CSV, XML content never compressed
- Post-compression validator: headings, URLs, inline code counts preserved or fallback to original
- Token estimation module (`src/token-estimate.mjs`): per-model character-per-token ratios (Claude: /3.5, GPT/Gemini: /4); extension defaults to `/4` (unknown model family)

### Fixed
- YAML false positive: raised detection threshold from 2 to 3 lines, added `---` frontmatter detection
- `rather` in hedging patterns now uses negative lookahead to preserve `rather than` constructions

## [1.0.0] - 2026-06-05

### Added
- Initial release
- `/compress on|off|verbose|status` commands
- Algorithmic compression for EN and IT
- Code block preservation (fenced + inline)
- Per-message language auto-detection
- Verbose mode with token savings estimate
- Cross-platform installer (install.sh + install.ps1)

