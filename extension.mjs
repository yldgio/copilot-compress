/**
 * copilot-compress — Copilot CLI extension
 * Algorithmically compresses user prompts to reduce token consumption.
 * Toggle: /compress on|off|verbose|status
 * Supports EN + IT. Zero LLM calls.
 */

import { joinSession } from "@github/copilot-sdk/extension";

// ─── Compression helper ───────────────────────────────────────────────────────

// ── English filler words ──────────────────────────────────────────────────────
const ENGLISH_FILLERS = /\b(a|an|the|and|or|but|so|yet|for|nor|it|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|to|of|in|on|at|by|with|from|as|that|this|these|those|i|we|you|they|he|she|its|our|your|their|my|his|her|very|just|really|quite|also|even|still|already|now|then|here|there|please|thank|thanks|sure|okay|ok)\b/gi;

// ── Italian filler words ──────────────────────────────────────────────────────

// Multi-word phrases (removed first, before single-word pass)
const IT_PHRASES = [
  'in sostanza', 'in pratica', 'in effetti', 'in realtà',
  'per quanto riguarda', 'dal punto di vista', 'a livello di',
  'al fine di', 'allo scopo di', 'nel senso che',
  'per il fatto che', 'a causa del fatto che',
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
 * Caveman compression: strips articles, filler words, pleasantries.
 * Keeps technical terms, numbers, proper nouns, and action verbs exact.
 * Returns a compressed version of the input string.
 * Reduction: ~40-60% on prose.
 * Pure function — no I/O, no DB.
 *
 * @param {string} text - Text to compress.
 * @param {'en'|'it'} [lang='en'] - Language of the text; controls filler word list.
 */
function compressText(text, lang = 'en') {
  if (!text || text.length === 0) return text;

  let compressed = text;

  if (lang === 'it') {
    // Pass 1: remove multi-word phrases
    for (const phrase of IT_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      compressed = compressed.replace(new RegExp(escaped, 'gi'), ' ');
    }

    // Pass 2: remove single-word fillers
    compressed = compressed.replace(buildItalianSinglePattern(), ' ');

    // Pass 3: remove contracted prepositions (mid-sentence only)
    compressed = compressed.replace(buildItalianContractedPattern(), ' ');
  } else {
    // English (default)
    compressed = compressed.replace(ENGLISH_FILLERS, ' ');
  }

  // Normalize whitespace and punctuation spacing
  compressed = compressed
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\s+([.,;:])/g, '$1');

  return compressed;
}

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
function extractCodeBlocks(text) {
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
function restoreCodeBlocks(text, slots) {
  let out = text;
  for (const [key, original] of slots) {
    out = out.split(key).join(original);
  }
  return out;
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
