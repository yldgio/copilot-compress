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
 * @param {'off'|'lite'|'standard'|'aggressive'} [intensity='standard'] - Compression intensity level.
 *   Body is unchanged in 1.B — intensity will be wired in 1.C.
 */
export function compressText(text, lang = 'en', intensity = 'standard') {
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
