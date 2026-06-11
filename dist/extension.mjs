// Built by rollup — do not edit directly. Edit src/ and run npm run build.
import { joinSession } from '@github/copilot-sdk/extension';

// ─── Compression helper ───────────────────────────────────────────────────────

// ── English filler words ──────────────────────────────────────────────────────
const ENGLISH_FILLERS = /\b(a|an|the|and|or|but|so|yet|for|nor|it|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|to|of|in|on|at|by|with|from|as|that|this|these|those|i|we|you|they|he|she|its|our|your|their|my|his|her|very|just|really|quite|also|even|still|already|now|then|here|there|please|thank|thanks|sure|okay|ok)\b/gi;

// ── English pleasantries & hedging (intensity-gated) ─────────────────────────

// Opening pleasantry words/phrases at the start of a message — all non-off levels.
const EN_OPENING_PHRASES = /^(sure[!.,]?\s*|okay[!.,]?\s*|ok[!.,]?\s*|of course[!.,]?\s*|certainly[!.,]?\s*|absolutely[!.,]?\s*|happy to help[!.,]?\s*|glad to help[!.,]?\s*|no problem[!.,]?\s*|no worries[!.,]?\s*)/i;

// Inline pleasantry phrases — all non-off levels.
const EN_PLEASANTRIES_INLINE = /\b(you're welcome|my pleasure|with pleasure)\b[!.]?/gi;

// Hedging language — standard+ only.
const EN_HEDGING = /\b(i think|i believe|i suppose|i guess|probably|perhaps|maybe|possibly|it seems|it appears|sort of|kind of|somewhat|rather(?!\s+than)|a bit|a little)\b/gi;

// Verbose connective/transitional phrases — standard+ only.
const EN_CONNECTIVES = /\b(however|nevertheless|nonetheless|therefore|consequently|in order to|with that said|that being said|having said that|due to the fact that|it is worth noting that|it should be noted that)\b/gi;

// ── Italian filler words ──────────────────────────────────────────────────────

// Multi-word phrases (removed first, before single-word pass)
const IT_PHRASES = [
  'in sostanza', 'in pratica', 'in effetti', 'in realtà',
  'per quanto riguarda', 'dal punto di vista', 'a livello di',
  'al fine di', 'allo scopo di', 'nel senso che',
  'per il fatto che', 'a causa del fatto che',
];

// ── Italian pleasantries (all non-off intensity levels) ───────────────────────
const IT_PLEASANTRY_WORDS = [
  'certo', 'certamente', 'assolutamente', 'figurati', 'prego',
  'volentieri', 'nessun problema',
];

// ── Italian hedging (standard + aggressive only) ──────────────────────────────
const IT_HEDGING_WORDS = [
  'probabilmente', 'forse', 'magari', 'possibilmente',
  'diciamo', 'in un certo senso', 'per così dire',
  'mi sembra', 'sembra che', 'pare che', 'a quanto pare',
];

// Single-word discourse fillers / adverbs safe to remove unconditionally.
// NOT included: che, ne, si, ci, lo, la, li, le, gli (polysemous pronoun+conjunction).
// Use (?<!\w)…(?!\w) instead of \b…\b so accented endings (e.g. però→ò) are handled.
const IT_SINGLE_WORDS = [
  'quindi', 'allora', 'però', 'tuttavia', 'inoltre', 'pertanto',
  'dunque', 'ebbene', 'insomma', 'comunque', 'appunto',
  'semplicemente', 'praticamente', 'ovviamente', 'chiaramente',
  'naturalmente', 'sicuramente', 'certamente', 'effettivamente',
  'fondamentalmente', 'sostanzialmente', 'essenzialmente',
  'generalmente', 'normalmente', 'tipicamente', 'solitamente',
  'abitualmente', 'frequentemente', 'spesso', 'talvolta', 'eventualmente',
];

// Build single-word filler regex once (not at module load — keep it lazy for testability)
function buildItalianSinglePattern() {
  return new RegExp(`(?<!\\w)(${IT_SINGLE_WORDS.join('|')})(?!\\w)`, 'gi');
}

// Contracted prepositions: safe to remove, but only mid-sentence.
// Heuristic: keep if at start of string or preceded by comma/sentence-boundary char.
// Pattern: require a non-boundary character + whitespace before the word.
const IT_CONTRACTED = [
  'della', 'dello', 'delle', 'degli',
  'nella', 'nello', 'nelle', 'negli',
  'sulla', 'sullo', 'sulle', 'sugli',
  'dalla', 'dallo', 'dalle', 'dagli',
  'alla',  'allo',  'alle',  'agli',
];

function buildItalianContractedPattern() {
  // (?<=[^.,!?\n][ \t]+) — must be preceded by a non-sentence-boundary char + horizontal
  // whitespace only (space/tab). Using [ \t]+ rather than \s+ so that newlines act as
  // sentence boundaries — a contracted preposition at the start of a new line is preserved.
  return new RegExp(
    `(?<=[^.,!?\\n][ \\t]+)\\b(${IT_CONTRACTED.join('|')})\\b`,
    'gi',
  );
}

/**
 * Apply a list of Italian words/phrases as whitespace replacements.
 * Multi-word entries are processed first (to prevent partial single-word matches).
 *
 * @param {string} text
 * @param {string[]} words
 * @returns {string}
 */
function applyItalianWordList(text, words) {
  let result = text;
  // Multi-word phrases first
  for (const word of words) {
    if (word.includes(' ')) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), ' ');
    }
  }
  // Single words with lookaround boundaries (handles accented chars)
  const singles = words.filter(w => !w.includes(' '));
  if (singles.length > 0) {
    const pat = new RegExp(`(?<!\\w)(${singles.join('|')})(?!\\w)`, 'gi');
    result = result.replace(pat, ' ');
  }
  return result;
}

/**
 * Safety gate: refuse to return compressed text if the result looks over-stripped.
 * Only applies when the original text was substantial (≥ 8 words) — short inputs
 * naturally produce short output and are never considered unsafe.
 *
 * Conditions that fail the gate:
 *   • Compressed result has fewer than 5 words.
 *   • More than 40% of compressed words (after word[0]) start with a capital letter,
 *     suggesting critical context words were stripped while proper nouns survived.
 *
 * @param {string} original  - Original input text.
 * @param {string} compressed - Compressed output.
 * @returns {boolean} true if safe to return, false to discard.
 */
function isSafeToCompress(original, compressed) {
  // Short originals naturally compress to few words — never gate them.
  const originalWords = original.trim().split(/\s+/);
  if (originalWords.length < 8) return true;

  const words = compressed.trim().split(/\s+/);
  if (words.length < 5) return false;

  // Proper noun heuristic: words[1..] starting uppercase
  const properNouns = words.slice(1).filter(w => /^[A-Z]/.test(w));
  if (properNouns.length / words.length > 0.40) return false;

  return true;
}

/**
 * Caveman compression: strips articles, filler words, pleasantries, hedging.
 * Keeps technical terms, numbers, proper nouns, and action verbs exact.
 * Returns a compressed version of the input string, or `undefined` if the
 * safety gate determines the result is unsafe (too short / over-stripped).
 * Reduction: ~40-60% on prose.
 * Pure function — no I/O, no DB.
 *
 * @param {string} text - Text to compress.
 * @param {'en'|'it'} [lang='en'] - Language of the text; controls filler word list.
 * @param {'off'|'lite'|'standard'|'aggressive'} [intensity='standard'] - Compression depth.
 *   off        — pass through unchanged (no compression)
 *   lite       — pleasantries only (safe subset, no stopword removal)
 *   standard   — pleasantries + hedging + connectives + stopwords (default)
 *   aggressive — same as standard + comment stripping in code blocks (wired in extension.mjs)
 * @returns {string|undefined} Compressed text, or undefined if safety gate fires.
 */
function compressText(text, lang = 'en', intensity = 'standard') {
  if (!text || text.length === 0) return text;

  let compressed = text;

  if (lang === 'it') {
    // Pass 0: pleasantries (all non-off levels — lite, standard, aggressive)
    if (intensity !== 'off') {
      compressed = applyItalianWordList(compressed, IT_PLEASANTRY_WORDS);
    }

    // Pass 1: remove multi-word phrases
    for (const phrase of IT_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      compressed = compressed.replace(new RegExp(escaped, 'gi'), ' ');
    }

    // Pass 2: remove single-word fillers
    compressed = compressed.replace(buildItalianSinglePattern(), ' ');

    // Pass 3: remove contracted prepositions (mid-sentence only)
    compressed = compressed.replace(buildItalianContractedPattern(), ' ');

    // Pass 4: hedging (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = applyItalianWordList(compressed, IT_HEDGING_WORDS);
    }
  } else {
    // English (default)

    // Pass 0: pleasantries (all non-off levels)
    if (intensity !== 'off') {
      compressed = compressed.replace(EN_OPENING_PHRASES, '');
      compressed = compressed.replace(EN_PLEASANTRIES_INLINE, '');
    }

    // Pass 1: hedging + connectives (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = compressed.replace(EN_HEDGING, '');
      compressed = compressed.replace(EN_CONNECTIVES, '');
    }

    // Pass 2: existing ENGLISH_FILLERS (standard+)
    if (intensity === 'standard' || intensity === 'aggressive') {
      compressed = compressed.replace(ENGLISH_FILLERS, ' ');
    }
  }

  // Normalize whitespace and punctuation spacing
  compressed = compressed
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\s+([.,;:])/g, '$1');

  // Safety gate: return undefined if compression over-stripped long prose
  if (!isSafeToCompress(text, compressed)) return undefined;

  return compressed;
}

// ─── Tool output compressor ───────────────────────────────────────────────────

const GREP_MATCH_LIMIT   = 50;
const VIEW_LINE_LIMIT    = 200;
const BASH_BYTE_LIMIT    = 5 * 1024; // 5 KB
const GENERIC_BYTE_LIMIT = 8 * 1024; // 8 KB

/**
 * Compresses tool output before it enters the LLM context.
 * Only active when intensity !== 'off'.
 *
 * Strategies per tool:
 * - grep: keep only filename:linenum lines, cap at 50 matches
 * - view: cap at 200 lines, add "[N more lines omitted]" marker
 * - bash/shell: cap stdout at 5KB, add "[truncated]" marker
 * - generic: cap at 8KB
 *
 * Data format safety: JSON output is never truncated mid-structure.
 *
 * @param {string} toolName
 * @param {string} output  - the tool output as a string
 * @param {'off'|'lite'|'standard'|'aggressive'} intensity
 * @returns {string} - compressed output (may equal input if under limits)
 */
function compressToolOutput(toolName, output, intensity) {
  if (!output || intensity === 'off') return output;

  // JSON passthrough — never truncate mid-structure
  const trimmed = output.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return output; } catch { /* not valid JSON — fall through */ }
  }

  switch (toolName.toLowerCase()) {
    case 'grep':
    case 'search':
      return compressGrep(output);
    case 'view':
    case 'read':
    case 'read_file':
      return compressView(output);
    case 'bash':
    case 'shell':
    case 'run_command':
    case 'execute':
      return compressBash(output);
    default:
      return compressGeneric(output);
  }
}

function compressGrep(output) {
  const lines      = output.split(/\r?\n/);
  const matchLines = lines.filter(l => l.includes(':'));
  // Only filter and cap when the match count exceeds the limit;
  // below the limit, return the original output unchanged (preserves summary lines etc.)
  if (matchLines.length <= GREP_MATCH_LIMIT) return output;
  const kept    = matchLines.slice(0, GREP_MATCH_LIMIT);
  const omitted = matchLines.length - GREP_MATCH_LIMIT;
  return kept.join('\n') + `\n[${omitted} more matches omitted]`;
}

function compressView(output) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= VIEW_LINE_LIMIT) return output;
  const kept    = lines.slice(0, VIEW_LINE_LIMIT);
  const omitted = lines.length - VIEW_LINE_LIMIT;
  return kept.join('\n') + `\n[${omitted} more lines omitted]`;
}

function compressBash(output) {
  if (output.length <= BASH_BYTE_LIMIT) return output;
  return output.slice(0, BASH_BYTE_LIMIT) + '\n[truncated — output exceeded 5KB]';
}

function compressGeneric(output) {
  if (output.length <= GENERIC_BYTE_LIMIT) return output;
  return output.slice(0, GENERIC_BYTE_LIMIT) + '\n[truncated — output exceeded 8KB]';
}

// Extract fenced and inline code blocks from text, replacing them with
// placeholders so the compression pass never touches code content.
// Placeholders survive compressText() unchanged (no filler words match __CODEBLOCK_N__).

const FENCED_RE  = /```[\w-]*\r?\n[\s\S]*?```/g;
const INLINE_RE  = /`[^`\r\n]+`/g;
const SLOT_PREFIX = '__CODEBLOCK_';

/**
 * @param {string} text
 * @param {'off'|'lite'|'standard'|'aggressive'} [intensity='standard'] - Reserved for 1.C; ignored here.
 * @returns {{ stripped: string, slots: Map<string, { raw: string, lang: string }> }}
 */
function extractCodeBlocks(text, intensity = 'standard') {
  const slots = new Map();
  let idx = 0;

  // Fenced first (they may contain backticks)
  let stripped = text.replace(FENCED_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    const lang = match.match(/^```([\w-]*)/)?.[1] ?? '';
    slots.set(key, { raw: match, lang });
    return key;
  });

  // Inline second
  stripped = stripped.replace(INLINE_RE, (match) => {
    const key = `${SLOT_PREFIX}${idx++}__`;
    slots.set(key, { raw: match, lang: '' });
    return key;
  });

  return { stripped, slots };
}

/**
 * @param {string} text
 * @param {Map<string, { raw: string, lang: string }>} slots
 * @returns {string}
 */
function restoreCodeBlocks(text, slots) {
  let out = text;
  for (const [key, slot] of slots) {
    out = out.split(key).join(slot.raw);
  }
  return out;
}

// Language-aware comment stripping for fenced code blocks.
// Used by extractCodeBlocks in aggressive intensity mode.
// Fail-closed: returns original code on any error or unsupported language.

const JS_LANGS    = new Set(['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript']);
const PY_LANGS    = new Set(['py', 'python']);
const RUST_LANGS  = new Set(['rs', 'rust']);
const GO_LANGS    = new Set(['go']);
const SHELL_LANGS = new Set(['sh', 'bash', 'shell', 'zsh']);

/**
 * Strip comments from code based on language tag.
 * Returns original if lang unsupported or on any error (fail-closed).
 * @param {string} code - code content (no fence markers)
 * @param {string} lang - lowercased language tag
 * @returns {string}
 */
function stripComments(code, lang) {
  try {
    const l = lang.toLowerCase();
    if (JS_LANGS.has(l))    return stripJsComments(code);
    if (PY_LANGS.has(l))    return stripPyComments(code);
    if (RUST_LANGS.has(l))  return stripJsComments(code); // same pattern as JS
    if (GO_LANGS.has(l))    return stripJsComments(code); // same pattern as JS
    if (SHELL_LANGS.has(l)) return stripShellComments(code);
    return code;
  } catch {
    return code;
  }
}

function stripJsComments(code) {
  let out = code.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/^\s*\/\/[^\n]*/gm, '');
  // Require actual whitespace before // so URL schemes (://) and regex
  // escape sequences (\/\/) are never touched.
  out = out.replace(/[ \t]+\/\/[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function stripPyComments(code) {
  let out = code.replace(/"""[\s\S]*?"""/g, '');
  out = out.replace(/'''[\s\S]*?'''/g, '');
  out = out.replace(/^\s*#[^\n]*/gm, '');
  // Require actual whitespace before # so URL fragments (#anchor) and
  // shebang-style strings inside literals are never touched.
  out = out.replace(/[ \t]+#[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function stripShellComments(code) {
  let out = code.replace(/^\s*#[^\n]*/gm, '');
  // Require actual whitespace before # so URL fragments inside strings
  // are never touched.
  out = out.replace(/[ \t]+#[^\n]*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

// Heuristic language detection: EN vs IT.
// Runs on prose text (code blocks already extracted).
// Returns 'it' if Italian indicator score >= IT_THRESHOLD; 'en' otherwise.
// Tie and ambiguity → 'en'.

const IT_THRESHOLD = 0.30; // 30% of words must be Italian indicators

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
function detectLang(text) {
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

// Data format detection helpers.
// Used to bypass compression for content that must never be altered:
// structured data formats (JSON, YAML, TOML, CSV, XML, etc.).

const DATA_FORMAT_LANGS = new Set(['json', 'yaml', 'yml', 'toml', 'csv', 'xml', 'jsonc', 'json5']);

/**
 * Returns true if the language tag identifies a data format that must
 * never be compressed.
 *
 * @param {string} lang
 * @returns {boolean}
 */
function isDataFormatLang(lang) {
  return DATA_FORMAT_LANGS.has(lang.toLowerCase());
}

/**
 * Heuristic detection for unfenced JSON/YAML/TOML snippets in prose.
 * Fail-closed: returns false on any error.
 *
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeDataFormat(text) {
  try {
    const t = text.trim();
    // JSON check
    if (t.startsWith('{') || t.startsWith('[')) {
      try { JSON.parse(t); return true; } catch { /* not valid JSON */ }
    }
    // YAML frontmatter / document separator — strong signal
    if (t.includes('---\n') || t.startsWith('---')) return true;
    // YAML heuristic: require 3+ key:value lines (raised from 2 to avoid false
    // positives on natural-language bullets like "Note: X\nWarning: Y")
    const lines = t.split(/\r?\n/);
    const yamlLines = lines.filter(l => /^\s*[\w-]+\s*:/.test(l));
    if (yamlLines.length >= 3 && yamlLines.length >= lines.length * 0.5) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates that compression preserved structural invariants.
 * Returns true if compressed is safe to use; false triggers fallback to original.
 *
 * Checks:
 * 1. Heading count matches (markdown # headings)
 * 2. URL set equality (all URLs in original present in compressed)
 * 3. Inline backtick count matches
 *
 * Fail-closed: returns false on any error.
 *
 * @param {string} original
 * @param {string} compressed
 * @returns {boolean}
 */
function validate(original, compressed) {
  try {
    // 1. Heading count
    const origHeadings = (original.match(/^#{1,6}\s/gm)  || []).length;
    const compHeadings = (compressed.match(/^#{1,6}\s/gm) || []).length;
    if (origHeadings !== compHeadings) return false;

    // 2. URLs — every URL in original must be present in compressed
    const origUrls = original.match(/https?:\/\/[^\s)>"]+/g) || [];
    const compText = compressed;
    for (const url of origUrls) {
      if (!compText.includes(url)) return false;
    }

    // 3. Inline backtick count
    const origBt = (original.match(/`[^`\r\n]+`/g)  || []).length;
    const compBt = (compressed.match(/`[^`\r\n]+`/g) || []).length;
    if (origBt !== compBt) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Estimates token count for a string.
 * Uses model-family-specific character-per-token ratios.
 *
 * @param {string} text
 * @param {'claude'|'gpt'|'gemini'|'unknown'} [modelFamily='unknown']
 * @returns {number} estimated token count
 */
function estimateTokens(text, modelFamily = 'unknown') {
  const len = text.length;
  switch (modelFamily) {
    case 'claude':  return Math.ceil(len / 3.5);
    case 'gpt':     return Math.ceil(len / 4);
    case 'gemini':  return Math.ceil(len / 4);
    default:        return Math.ceil(len / 4);
  }
}

/**
 * copilot-compress — Copilot CLI extension
 * Algorithmically compresses user prompts to reduce token consumption.
 * Toggle: /compress on|off|lite|standard|aggressive|verbose|status
 * Supports EN + IT. Zero LLM calls.
 */


// ─── Session state ────────────────────────────────────────────────────────────
let session;
let intensity   = 'off'; // 'off' | 'lite' | 'standard' | 'aggressive'
let verboseMode = false;
let stats = { originalChars: 0, compressedChars: 0, messageCount: 0, tokensSaved: 0, toolOutputSavedChars: 0, toolCallCount: 0 };

// ─── ToolResultObject helpers ─────────────────────────────────────────────────
// SDK shape (v1.0.61): { textResultForLlm: string, resultType, error?, ... }

function getToolOutputString(toolResult) {
  if (typeof toolResult === 'string') return toolResult;
  if (typeof toolResult?.textResultForLlm === 'string') return toolResult.textResultForLlm;
  return null;
}

function setToolOutputString(toolResult, newOutput) {
  if (typeof toolResult === 'string') return newOutput;
  return { ...toolResult, textResultForLlm: newOutput };
}

// ─── /compress command handler ────────────────────────────────────────────────
async function handleCompressCommand(context) {
  const sub = (context.args ?? '').trim().toLowerCase();

  if (sub === 'on') {
    intensity = 'standard'; // backward compat: /compress on → standard
    await session.log('Compression **ON** (standard) — lang: auto-detect, EN/IT');
    return;
  }
  if (sub === 'off') {
    intensity = 'off';
    await session.log('Compression **OFF**');
    return;
  }
  if (sub === 'lite' || sub === 'standard' || sub === 'aggressive') {
    intensity = sub;
    await session.log(`Compression **ON** (${intensity}) — lang: auto-detect, EN/IT`);
    return;
  }
  if (sub === 'verbose') {
    verboseMode = !verboseMode;
    await session.log(`Verbose ${verboseMode ? '**ON**' : '**OFF**'}`);
    return;
  }
  if (sub === 'status' || sub === '') {
    const tokensSaved = stats.tokensSaved;
    if (intensity === 'off') {
      await session.log(
        `Compression: **OFF** · Verbose: ${verboseMode ? '**ON**' : '**OFF**'}`,
      );
    } else {
      const toolLine = stats.toolCallCount > 0
        ? `\nTool output: ~${stats.toolOutputSavedChars.toLocaleString()} chars saved across ${stats.toolCallCount} tool call${stats.toolCallCount === 1 ? '' : 's'}`
        : '';
      await session.log([
        `Compression: **ON** (${intensity}) · Verbose: ${verboseMode ? '**ON**' : '**OFF**'}`,
        `Session: ${stats.messageCount} msgs compressed, ~${tokensSaved.toLocaleString()} tokens saved${toolLine}`,
      ].join('\n'));
    }
    return;
  }
  await session.log('Unknown subcommand. Usage: `/compress on|off|lite|standard|aggressive|verbose|status`');
}

// ─── Extension entry point ────────────────────────────────────────────────────
session = await joinSession({
  commands: [
    {
      name: "compress",
      description: "Toggle algorithmic prompt compression. Subcommands: on, off, lite, standard, aggressive, verbose, status.",
      handler: handleCompressCommand,
    },
  ],
  hooks: {
    onPostToolUse: async ({ toolName, toolResult }) => {
      try {
        if (intensity === 'off') return;

        const outputStr = getToolOutputString(toolResult);
        if (!outputStr) return;

        const compressed = compressToolOutput(toolName, outputStr, intensity);
        if (compressed === outputStr) return; // no change — avoid unnecessary allocation

        const savedChars = outputStr.length - compressed.length;
        stats.toolOutputSavedChars += savedChars;
        stats.toolCallCount        += 1;

        if (verboseMode) {
          const pct = Math.round((savedChars / outputStr.length) * 100);
          session.log(
            `Tool [${toolName}]: ${outputStr.length.toLocaleString()} → ${compressed.length.toLocaleString()} chars (-${pct}%)`,
            { ephemeral: true },
          ).catch(() => {});
        }

        return { modifiedResult: setToolOutputString(toolResult, compressed) };
      } catch {
        // Never crash the hook — return undefined = pass through unchanged
        return undefined;
      }
    },
    onUserPromptSubmitted: async (input) => {
      const text = (input.prompt ?? '').trim();
      if (!text) return undefined;

      // Pass-through when disabled
      if (intensity === 'off') return undefined;

      // Compression pipeline
      try {
        const originalLen = text.length;

        // Step 1: full-message data format bypass (before block extraction)
        if (looksLikeDataFormat(text)) {
          return; // return void = no modification, original prompt used
        }

        const { stripped, slots } = extractCodeBlocks(text);

        // Step 3: strip comments from code slots at aggressive intensity
        // Composition root: extension.mjs owns cross-module wiring
        if (intensity === 'aggressive') {
          for (const [key, slot] of slots) {
            if (slot.lang && !isDataFormatLang(slot.lang)) {
              const slotCode = slot.raw.match(/^```[\w-]*\r?\n([\s\S]*?)```$/)?.[1] ?? '';
              const strippedContent = stripComments(slotCode, slot.lang);
              // CRLF is intentionally normalized to LF as part of aggressive compression
              slots.set(key, { raw: '```' + slot.lang + '\n' + strippedContent + '\n```', lang: slot.lang });
            }
          }
        }

        const lang = detectLang(stripped);
        const result = compressText(stripped, lang, intensity);
        if (result === undefined) return; // safety gate fired — fallback to original
        const finalText = restoreCodeBlocks(result, slots);

        if (!validate(text, finalText)) {
          if (verboseMode) session.log('⚠️ Validator: invariant failed, using original prompt');
          return; // void = no modification, original prompt used
        }

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
          const msgTokensSaved = estimateTokens(text) - estimateTokens(finalText);
          stats.tokensSaved += msgTokensSaved;
          session.log(
            `Compressed: ${originalLen.toLocaleString()} → ${compressedLen.toLocaleString()} chars (-${pct}%) · ~${msgTokensSaved.toLocaleString()} tokens saved (${intensity})`,
            { ephemeral: true },
          ).catch(() => {});
        } else {
          // Keep tokensSaved in sync even when verbose is off
          stats.tokensSaved += estimateTokens(text) - estimateTokens(finalText);
        }

        return { modifiedPrompt: finalText + note };
      } catch {
        // Never crash the hook — return undefined = pass through unchanged
        return undefined;
      }
    },
  },
});
